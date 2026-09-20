import type { PrismaClient } from "@pitchmyweb/db";
import { getDb } from "../db.js";

// Same approach as apps/api's db-test-helpers: the tests that need a
// database run against the real local dev Postgres, and each one removes
// exactly the rows it created. Deleting the user cascades away its accounts,
// auth keys and messages, so cleanup is one call.

let counter = 0;

export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `test-wa-${prefix}-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** A digits-only number in a range no real subscriber uses. */
export function uniquePhone(): string {
  counter += 1;
  return `99${String(Date.now()).slice(-8)}${String(counter).padStart(2, "0")}`;
}

export type TestFixture = {
  db: PrismaClient;
  userId: string;
  accountId: string;
  cleanup: () => Promise<void>;
};

export async function createTestAccount(prefix: string, status = "CONNECTED" as const): Promise<TestFixture> {
  const db = getDb();
  const user = await db.user.create({
    data: {
      email: uniqueEmail(prefix),
      // Never used to sign in; these tests never touch the auth routes.
      passwordHash: "not-a-real-hash",
    },
  });
  const account = await db.whatsAppAccount.create({
    data: { userId: user.id, status, phoneNumber: uniquePhone() },
  });

  return {
    db,
    userId: user.id,
    accountId: account.id,
    cleanup: async () => {
      await db.user.deleteMany({ where: { id: user.id } });
    },
  };
}
