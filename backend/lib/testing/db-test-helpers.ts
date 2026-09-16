import { prisma } from "../db/client";
import { hashPassword } from "../auth/password";

// Shared helper for Phase 4's integration test suite. Phase 1-3 tests use
// hand-built in-memory fakes (see lib/leads/lifecycle.test.ts,
// lib/business/dedupe.test.ts) because the logic under test is pure/
// transaction-shaped and a fake proves it without needing a live database.
// Phase 4's route/service layer is different: correctly proving ownership
// scoping, real concurrent-request idempotency, and multi-model detail
// payloads (Lead -> Business/Campaign/Activity/...) against a hand-rolled
// fake would mean re-implementing a meaningful slice of Prisma's query
// engine, which is itself a large, bug-prone undertaking (the project's own
// dedupe.test.ts already says as much for concurrent-write races: "a true
// concurrent-write race test belongs to... a live database"). This suite
// instead runs against the real local dev Postgres already used by
// `db:seed`, and every test cleans up the exact rows it created.

let counter = 0;

export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `test-phase4-${prefix}-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export type TestUser = { id: string; email: string };

export async function createTestUser(prefix: string): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const passwordHash = await hashPassword("Test1234!Strong");
  const user = await prisma.user.create({ data: { email, passwordHash } });
  return { id: user.id, email: user.email };
}

/** Deletes a test user; cascades away every Campaign/Lead/Session/Activity/... it owns. */
export async function deleteTestUser(userId: string): Promise<void> {
  await prisma.user.deleteMany({ where: { id: userId } });
}

export async function deleteTestUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
