import type { UserRole } from "@pitchmyweb/db";
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

/**
 * A syntactically valid Indian mobile number, unique per call across the
 * whole test run — including across concurrently-running test files, which
 * a per-file local counter is not (every file's counter starts at the same
 * value, so "+91-980000{counter}"-style fixtures collide across files that
 * happen to run in parallel against the same live dev database). Phase 2's
 * dedup engine treats a shared phone number as real corroborating evidence
 * (tier 2, corroborated by city), so two "different" test businesses across
 * two different files that happen to share one now legitimately dedup into
 * one — time+random entropy avoids that, the way uniqueEmail already avoids
 * the same problem for User.email.
 */
export function uniqueIndianPhone(): string {
  const raw = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  return `+91-9${raw.slice(-9)}`;
}

/**
 * Same reasoning as uniqueIndianPhone, for Business.name: several test
 * files independently reuse the literal fixture name "Lakshmi Dental Care"
 * with the same city, which Phase 2's dedup engine now treats as an exact
 * tier-4 match — including across concurrently-running files. Appends
 * unique entropy so "the same fixture name" in two different files no
 * longer means "the same business."
 */
export function uniqueBusinessName(base: string): string {
  return `${base} ${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export type TestUser = { id: string; email: string; role: UserRole };

export async function createTestUser(prefix: string, options?: { role?: UserRole }): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const passwordHash = await hashPassword("Test1234!Strong");
  const user = await prisma.user.create({ data: { email, passwordHash, role: options?.role ?? "USER" } });
  return { id: user.id, email: user.email, role: user.role };
}

/** Deletes a test user; cascades away every Campaign/Lead/Session/Activity/... it owns. */
export async function deleteTestUser(userId: string): Promise<void> {
  await prisma.user.deleteMany({ where: { id: userId } });
}

export async function deleteTestUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

/**
 * Best-effort cleanup for Business rows a test created (matched by its own
 * externalId prefix). Phase 2's dedup engine means a business created here
 * can legitimately end up attached to a Lead owned by a *different*,
 * concurrently-running test file's user (tests share one live dev
 * database) — deleting it would violate that other test's still-live
 * foreign key. Swallows exactly that case (P2003) and leaves the row in
 * place; anything else still throws. Leaving a shared business behind is
 * harmless (it just stays in the dev database), unlike leaving a whole
 * test user behind.
 */
export async function deleteTestBusinesses(externalIdPrefix: string): Promise<void> {
  try {
    await prisma.business.deleteMany({ where: { source: "demo", externalId: { startsWith: externalIdPrefix } } });
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
  }
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2003";
}
