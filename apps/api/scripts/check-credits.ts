// Checks every pitch wallet against its credit ledger and prints a report.
// Read-only: nothing is changed.
//
//   npm run credits:check -w apps/api                 # every user
//   npm run credits:check -w apps/api -- you@x.com    # one user, with history
//
// Exit code 1 when any wallet disagrees with its ledger.
import { prisma } from "../src/lib/db/client";
import { listCreditLedger, reconcileCreditLedger } from "../src/lib/checkout/wallet.service";

const email = process.argv[2]?.trim().toLowerCase();
let userId: string | undefined;
if (email) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    console.error(`no user ${email}`);
    process.exit(1);
  }
  userId = user.id;
}

const [{ checked, mismatches }, totals] = await Promise.all([
  reconcileCreditLedger(prisma, { userId }),
  prisma.pitchCreditLedger.groupBy({ by: ["type"], where: userId ? { userId } : {}, _sum: { amount: true }, _count: true }),
]);

console.log(`Ledger movements${email ? ` for ${email}` : " (all users)"}:`);
for (const row of totals.sort((a, b) => a.type.localeCompare(b.type))) {
  console.log(`  ${row.type.padEnd(10)} ${String(row._count).padStart(6)} rows  ${String(row._sum.amount ?? 0).padStart(8)} credits`);
}

if (userId) {
  const { wallet, items } = await listCreditLedger(prisma, userId, { page: 1, pageSize: 20 });
  console.log(`\nWallet: available ${wallet.availableCredits}, reserved ${wallet.reservedCredits}, used ${wallet.usedCredits}`);
  console.log("Latest movements:");
  for (const item of items) {
    console.log(`  ${item.createdAt.toISOString()}  ${item.type.padEnd(10)} ${String(item.amount).padStart(4)}  ${item.batchId ? `batch ${item.batchId}` : item.orderId ? `order ${item.orderId}` : ""}`);
  }
}

console.log(`\nChecked ${checked} wallet(s): ${mismatches.length === 0 ? "all match their ledger." : `${mismatches.length} MISMATCH(ES)`}`);
for (const mismatch of mismatches) {
  const w = mismatch.wallet;
  const e = mismatch.expected;
  console.log(
    `  ${mismatch.userId}: wallet ${w.availableCredits}/${w.reservedCredits}/${w.usedCredits}, ledger says ${e.availableCredits}/${e.reservedCredits}/${e.usedCredits} (available/reserved/used)`,
  );
}
await prisma.$disconnect();
process.exit(mismatches.length === 0 ? 0 : 1);
