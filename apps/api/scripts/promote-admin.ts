// Promote an existing user to SUPER_ADMIN.
//
//   npm run admin:promote -w apps/api -- you@example.com
import { prisma } from "../src/lib/db/client";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("usage: npm run admin:promote -w apps/api -- <email>");
  process.exit(1);
}

const user = await prisma.user.update({
  where: { email },
  data: { role: "SUPER_ADMIN" },
  select: { id: true, email: true, role: true },
});
console.log(`promoted ${user.email} (${user.id}) to ${user.role}`);
await prisma.$disconnect();
