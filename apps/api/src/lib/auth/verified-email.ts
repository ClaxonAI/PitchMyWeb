import type { PrismaClient, User } from "@pitchmyweb/db";

/**
 * A Google/GitHub sign-in with a verified email is about to be linked to an
 * existing account found by that email. If the account was only ever used
 * with a password, nobody has proven the address was its creator's: anyone
 * can register someone else's email. Linking as-is would hand the real owner
 * an account whose password the registrant still knows, and log them into it.
 *
 * So the verified sign-in takes the account over cleanly: the unverified
 * password stops working and every session opened with it ends. Returns the
 * fields to write with the link; a verified account is left as it is.
 */
export async function takeOverUnverifiedAccount(
  db: PrismaClient,
  user: Pick<User, "id" | "emailVerifiedAt" | "passwordHash">,
): Promise<{ emailVerifiedAt?: Date; passwordHash?: null }> {
  if (user.emailVerifiedAt) return {};
  if (user.passwordHash) await db.session.deleteMany({ where: { userId: user.id } });
  return { emailVerifiedAt: new Date(), passwordHash: null };
}
