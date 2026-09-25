import type { PrismaClient, User } from "@pitchmyweb/db";
import { hashPassword, verifyPassword } from "../auth/password";
import { getAccessSnapshot } from "../checkout/paid-access";
import { ValidationError } from "../errors";
import type { ChangePasswordInput, MeUpdateInput } from "../validation/me";
import { hasConnectedWhatsApp } from "../whatsapp/account.service";

export type MeProfile = {
  id: string;
  email: string;
  name: string | null;
  role: User["role"];
  planId: string | null;
  /** Has at least one paid order — decides markets and dashboard wording, never how much can be spent. */
  hasPaidAccess: boolean;
  allowedMarkets: Array<"india" | "foreign">;
  /** True when the wallet can cover at least one pitch (or discovery is ungated). */
  canDiscover: boolean;
  /** Pitch credits not yet reserved by any batch — what a new "how many to pitch" request can draw from. */
  availableCredits: number;
  /** Credits reserved by in-flight batches, not yet consumed or refunded. */
  reservedCredits: number;
  /** Credits consumed by pitches that actually sent. */
  usedCredits: number;
  /** A linked WhatsApp is connected right now — required to create or run a campaign. */
  whatsappConnected: boolean;
};

async function toProfile(db: PrismaClient, user: Pick<User, "id" | "email" | "name" | "role" | "planId">): Promise<MeProfile> {
  const [{ hasPaidAccess, canDiscover, allowedMarkets, wallet }, whatsappConnected] = await Promise.all([getAccessSnapshot(db, user.id), hasConnectedWhatsApp(db, user.id)]);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    planId: user.planId,
    hasPaidAccess,
    allowedMarkets,
    canDiscover,
    availableCredits: wallet.availableCredits,
    reservedCredits: wallet.reservedCredits,
    usedCredits: wallet.usedCredits,
    whatsappConnected,
  };
}

export async function getMe(db: PrismaClient, userId: string): Promise<MeProfile> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return toProfile(db, user);
}

export async function updateMe(db: PrismaClient, userId: string, input: MeUpdateInput): Promise<MeProfile> {
  const user = await db.user.update({ where: { id: userId }, data: { name: input.name } });
  return toProfile(db, user);
}

/**
 * Verifies `currentPassword` against the caller's own stored hash before
 * accepting `newPassword` â€” a wrong current password is a client input
 * problem (400 ValidationError), not a resource conflict or an
 * authentication failure (the caller is already authenticated; this proves
 * they also know the *current* credential before being allowed to replace
 * it, the same "reauthenticate to change something sensitive" pattern most
 * account-security flows use).
 */
export async function changePassword(db: PrismaClient, userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash) {
    throw new ValidationError("This account uses Google sign-in. Set a password from a password-based register flow first.");
  }
  const matches = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!matches) {
    throw new ValidationError("Current password is incorrect");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });
}
