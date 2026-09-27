import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { PrismaClient, User } from "@pitchmyweb/db";
import { AccountSuspendedError, InvalidResetCodeError } from "../errors";
import { hashPassword } from "./password";
import { deleteSessionsForUser } from "./session";

// Password reset by emailed code, in three calls:
//
//   request   email -> a 6-digit code is emailed if the address has an
//             account. The answer is the same either way, so the form can't
//             be used to find out who has an account.
//   verify    email + code -> a single-use reset token. A code allows
//             MAX_ATTEMPTS tries and lasts CODE_TTL; a wrong guess counts
//             against it, and after the last one the code is dead.
//   complete  token + new password -> the password is set, every session
//             for the account ends (a stolen one included), and the caller
//             signs in fresh.
//
// Only hashes are stored: sha256 of the code salted with its row id, and of
// the token. A new request replaces every earlier code for the account, and
// codes are not sent more than once a minute.

export const CODE_TTL_MINUTES = 10;
const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const codeHash = (rowId: string, code: string) => sha256(`${rowId}:${code}`);

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export type ResetCodeRequest =
  | { status: "sent"; userId: string; code: string }
  | { status: "cooldown" | "no_account" | "suspended" };

/**
 * Makes a fresh code for the account with this email, replacing earlier ones.
 * The caller emails it; nothing here reveals to the requester which status
 * came back.
 */
export async function createResetCode(db: PrismaClient, email: string, now = new Date()): Promise<ResetCodeRequest> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, suspendedAt: true } });
  if (!user) return { status: "no_account" };
  if (user.suspendedAt) return { status: "suspended" };

  const recent = await db.passwordResetCode.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - RESEND_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return { status: "cooldown" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.$transaction(async (tx) => {
    await tx.passwordResetCode.deleteMany({ where: { userId: user.id } });
    const row = await tx.passwordResetCode.create({
      data: { userId: user.id, codeHash: "pending", expiresAt: new Date(now.getTime() + CODE_TTL_MS) },
    });
    await tx.passwordResetCode.update({ where: { id: row.id }, data: { codeHash: codeHash(row.id, code) } });
  });
  return { status: "sent", userId: user.id, code };
}

/** Checks a code and, if it's right, trades it for a reset token (shown to the caller once). */
export async function verifyResetCode(db: PrismaClient, email: string, code: string, now = new Date()): Promise<{ resetToken: string }> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  const row = user
    ? await db.passwordResetCode.findFirst({ where: { userId: user.id, verifiedAt: null, consumedAt: null }, orderBy: { createdAt: "desc" } })
    : null;
  if (!row || row.expiresAt <= now || row.attempts >= MAX_ATTEMPTS) throw new InvalidResetCodeError();

  // Counted before comparing, conditionally, so parallel guesses can't share
  // one attempt.
  const counted = await db.passwordResetCode.updateMany({
    where: { id: row.id, attempts: { lt: MAX_ATTEMPTS }, verifiedAt: null },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) throw new InvalidResetCodeError();

  if (!/^\d{6}$/.test(code) || !sameHash(row.codeHash, codeHash(row.id, code))) {
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw new InvalidResetCodeError(
      left > 0
        ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`
        : "Too many wrong codes. Ask for a new one.",
    );
  }

  const resetToken = randomBytes(32).toString("base64url");
  const claimed = await db.passwordResetCode.updateMany({
    where: { id: row.id, verifiedAt: null },
    data: { verifiedAt: now, resetTokenHash: sha256(resetToken), resetTokenExpiresAt: new Date(now.getTime() + TOKEN_TTL_MS) },
  });
  if (claimed.count === 0) throw new InvalidResetCodeError();
  return { resetToken };
}

/** Sets the new password with a reset token, once, and ends every session for the account. */
export async function completePasswordReset(db: PrismaClient, resetToken: string, password: string, now = new Date()): Promise<User> {
  const row = await db.passwordResetCode.findUnique({ where: { resetTokenHash: sha256(resetToken) } });
  if (!row || row.consumedAt || !row.resetTokenExpiresAt || row.resetTokenExpiresAt <= now) {
    throw new InvalidResetCodeError("This reset link has expired. Start again to get a new code.");
  }
  const consumed = await db.passwordResetCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
  if (consumed.count === 0) throw new InvalidResetCodeError("This reset link has expired. Start again to get a new code.");

  const user = await db.user.findUnique({ where: { id: row.userId } });
  if (!user) throw new InvalidResetCodeError();
  if (user.suspendedAt) throw new AccountSuspendedError();

  const passwordHash = await hashPassword(password);
  const updated = await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  await deleteSessionsForUser(db, user.id);
  await db.passwordResetCode.deleteMany({ where: { userId: user.id, id: { not: row.id } } });
  return updated;
}
