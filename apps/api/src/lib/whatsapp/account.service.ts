import type { PrismaClient, WhatsAppAccount } from "@pitchmyweb/db";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { enqueueSessionCommand } from "./queue";

// Linked-account lifecycle. Every query is scoped by `{ id, userId }` rather
// than by id alone, so another user's account id is indistinguishable from
// one that does not exist — a 404, never a 403 that confirms it is real.
//
// Nothing here touches WhatsApp directly: connect/pairing-code/disconnect
// are commands placed on a queue, and the worker reports back through the
// account row and the event stream.

/** Phase 2 allows one linked account per user (see the schema comment). */
const MAX_ACCOUNTS_PER_USER = 1;

/**
 * What the API is willing to say about an account. Auth material is not
 * merely omitted here — it lives in a different table this file never reads.
 */
export type PublicAccount = Pick<
  WhatsAppAccount,
  | "id"
  | "phoneNumber"
  | "displayName"
  | "status"
  | "lastConnectedAt"
  | "lastSeenAt"
  | "lastError"
  | "linkedAt"
  | "logoutReason"
  | "createdAt"
  | "updatedAt"
>;

const PUBLIC_FIELDS = {
  id: true,
  phoneNumber: true,
  displayName: true,
  status: true,
  lastConnectedAt: true,
  lastSeenAt: true,
  lastError: true,
  linkedAt: true,
  logoutReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Every link attempt starts a new login for the session policy
 * (session-policy.ts): its own start time and no leftover reason from the
 * previous sign-out.
 */
function newLogin(now = new Date()) {
  return { linkedAt: now, logoutReason: null };
}

export async function listAccounts(db: PrismaClient, userId: string): Promise<PublicAccount[]> {
  return db.whatsAppAccount.findMany({
    where: { userId },
    select: PUBLIC_FIELDS,
    orderBy: { createdAt: "desc" },
  });
}

export async function getAccount(db: PrismaClient, userId: string, accountId: string): Promise<PublicAccount> {
  const account = await db.whatsAppAccount.findFirst({
    where: { id: accountId, userId },
    select: PUBLIC_FIELDS,
  });
  if (!account) throw new NotFoundError("WhatsApp account", accountId);
  return account;
}

export async function createAccount(db: PrismaClient, userId: string): Promise<PublicAccount> {
  const existing = await db.whatsAppAccount.count({ where: { userId } });
  if (existing >= MAX_ACCOUNTS_PER_USER) {
    throw new ConflictError("You already have a linked WhatsApp account. Disconnect it before linking another.");
  }
  return db.whatsAppAccount.create({
    data: { userId, status: "DISCONNECTED" },
    select: PUBLIC_FIELDS,
  });
}

/**
 * Starts (or restarts) a link attempt. The account is moved to CONNECTING
 * here rather than waiting for the worker, so the UI reflects the click
 * immediately even if the worker is briefly busy.
 */
export async function requestConnect(db: PrismaClient, userId: string, accountId: string): Promise<PublicAccount> {
  await getAccount(db, userId, accountId);
  const account = await db.whatsAppAccount.update({
    where: { id: accountId },
    data: { status: "CONNECTING", lastError: null, ...newLogin() },
    select: PUBLIC_FIELDS,
  });
  await enqueueSessionCommand({ type: "connect", accountId });
  return account;
}

/**
 * The number a user typed to link by code, as the digits WhatsApp expects
 * (country code first, no "+"), or null when it cannot be read safely.
 *
 * Stricter than the general normalizer on purpose. A bare "9488329318"
 * passes a digit count, but WhatsApp reads it as +94 (Sri Lanka) 88329318:
 * the code request then goes to a number that is not the user's, and nothing
 * ever arrives. So:
 *  - "+" first: the country code is explicit; digits taken as typed.
 *  - an Indian mobile written the local way (10 digits starting 6-9, with
 *    or without a leading 0): +91 is added. PitchMyWeb's users are in India.
 *  - 91 followed by an Indian mobile: already complete.
 *  - anything else without a "+": rejected, with a message asking for the
 *    country code, rather than guessed at.
 */
export function normalizeLinkingPhone(raw: string): string | null {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  if (/^0?[6-9]\d{9}$/.test(digits)) return `91${digits.slice(-10)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  return null;
}

/**
 * The alternative to scanning a QR: WhatsApp shows an 8-character code that
 * the user types on their phone.
 */
export async function requestPairingCode(
  db: PrismaClient,
  userId: string,
  accountId: string,
  rawPhone: string,
): Promise<PublicAccount> {
  const existing = await getAccount(db, userId, accountId);
  if (existing.status === "CONNECTED") {
    // A code request on a linked session would overwrite its credentials
    // with a half-registered device and sign it out.
    throw new ConflictError("This WhatsApp is already linked. Disconnect it first to link a different number.");
  }
  const phoneNumber = normalizeLinkingPhone(rawPhone);
  if (!phoneNumber) {
    throw new ValidationError("Include your country code, e.g. +91 94883 29318");
  }
  const account = await db.whatsAppAccount.update({
    where: { id: accountId },
    data: { status: "CONNECTING", lastError: null, ...newLogin() },
    select: PUBLIC_FIELDS,
  });
  await enqueueSessionCommand({ type: "pairing-code", accountId, phoneNumber });
  return account;
}

/**
 * Asks the worker to unlink the device. The worker is what actually wipes
 * the stored credentials and cancels queued messages — doing it here would
 * race with a socket that is still live.
 */
export async function requestDisconnect(db: PrismaClient, userId: string, accountId: string): Promise<PublicAccount> {
  const account = await getAccount(db, userId, accountId);
  await enqueueSessionCommand({ type: "disconnect", accountId });
  return account;
}

/**
 * Deletes the account row. The disconnect command goes out first so the
 * device is unlinked on WhatsApp rather than left as a dead entry in the
 * user's "Linked devices" list; the cascade then removes the stored auth
 * keys and messages.
 */
export async function deleteAccount(db: PrismaClient, userId: string, accountId: string): Promise<void> {
  await getAccount(db, userId, accountId);
  await enqueueSessionCommand({ type: "disconnect", accountId });
  await db.whatsAppAccount.delete({ where: { id: accountId } });
}

/** True when the user has a linked WhatsApp a campaign can send from (session-policy SENDABLE_STATUSES). */
export async function hasConnectedWhatsApp(db: PrismaClient, userId: string): Promise<boolean> {
  const count = await db.whatsAppAccount.count({ where: { userId, status: { in: ["CONNECTED", "RECONNECTING"] } } });
  return count > 0;
}

