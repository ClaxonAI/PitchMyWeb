import { randomBytes, createHash } from "node:crypto";
import type { PrismaClient, User } from "@pitchmyweb/db";

// Phase 4 auth (backend_tasks.md section 5.1/41: "secure sessions"). Sessions
// are opaque random tokens; only a SHA-256 hash of the token is ever
// persisted, so a database read (backup, replica, leaked row) cannot be
// replayed as a live session — the raw token exists only in the response
// cookie and the requesting client.
export const SESSION_COOKIE_NAME = "pmw_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type CreatedSession = {
  token: string;
  expiresAt: Date;
};

export async function createSession(db: PrismaClient, userId: string): Promise<CreatedSession> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return { token, expiresAt };
}

/**
 * Resolves a raw session token (as read from the cookie) to its owning User,
 * or null if the token is missing, unknown, or expired. Expired sessions are
 * opportunistically deleted rather than left to accumulate.
 */
export async function verifySessionToken(db: PrismaClient, token: string): Promise<User | null> {
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return session.user;
}

export async function deleteSessionByToken(db: PrismaClient, token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function deleteSessionsForUser(db: PrismaClient, userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}
