import type { PrismaClient } from "@pitchmyweb/db";
import { ALLOWED, deny, type PolicyDecision } from "@pitchmyweb/contracts";

// The API half of the outreach gate.
//
// This runs before a QUEUED row is created, so the user gets an immediate,
// inline reason instead of a message that quietly dies in the queue. It is
// deliberately *not* the authoritative check — apps/whatsapp-worker runs the
// full guard again immediately before sending, because everything here can
// go stale while a job waits: a business can reply STOP, the account can
// drop, the hourly cap can fill.
//
// What this cannot check, and the worker can:
//   * whether the number is actually on WhatsApp (needs a live socket)
//   * the per-account hourly/daily caps and the minimum gap between sends
//
// Both halves speak the same reason vocabulary (@pitchmyweb/contracts), so a
// denial means the same thing wherever it was decided.

export type PolicyInput = {
  userId: string;
  accountId: string;
  /** Digits only, already normalized by normalizePhoneForWhatsApp. */
  phoneNumber: string;
  leadId?: string | null;
};

/** How long an account must wait before messaging the same number again. */
const DUPLICATE_WINDOW_HOURS = 24;

const CONTACTED_STATUSES = ["SENDING", "SENT", "DELIVERED", "READ"] as const;

export async function evaluate(db: PrismaClient, input: PolicyInput): Promise<PolicyDecision> {
  if (!/^\d{8,15}$/.test(input.phoneNumber)) {
    return deny("invalid_number");
  }

  // Scoped by userId as well as id: another user's account id must behave
  // exactly like a nonexistent one.
  const account = await db.whatsAppAccount.findFirst({
    where: { id: input.accountId, userId: input.userId },
    select: { status: true },
  });
  if (!account || account.status !== "CONNECTED") {
    return deny("not_connected");
  }

  const optedOut = await db.optOut.findUnique({ where: { phoneNumber: input.phoneNumber } });
  if (optedOut) {
    return deny("opted_out");
  }

  const since = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000);
  const duplicate = await db.whatsAppMessage.findFirst({
    where: {
      accountId: input.accountId,
      phoneNumber: input.phoneNumber,
      status: { in: [...CONTACTED_STATUSES] },
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  if (duplicate) {
    return deny("recent_duplicate");
  }

  return ALLOWED;
}
