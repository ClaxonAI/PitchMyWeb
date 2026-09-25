import { createHash } from "node:crypto";
import type { PrismaClient } from "@pitchmyweb/db";
import { ConflictError } from "../errors";

// Device limits, by FingerprintJS visitor id (hashed; the raw id is never
// stored). Every new account gets the free pitch allowance, so accounts are
// what is limited — up to MAX_ACCOUNTS_PER_DEVICE may be created from one
// device, across email, Google and Clerk sign-up alike. Signing in to an
// account that already exists is never limited: a person must be able to
// reach their own account from a new phone, or after a browser update
// changes the fingerprint.

export const MAX_ACCOUNTS_PER_DEVICE = 3;

export function hashFingerprint(fingerprintId: string): string {
  return createHash("sha256").update(fingerprintId).digest("hex");
}

export class DeviceAccountLimitError extends ConflictError {
  constructor() {
    super(`This device already has ${MAX_ACCOUNTS_PER_DEVICE} accounts. Sign in to one of them instead.`);
  }
}

/** How many accounts were created on this device. */
export async function accountsOnDevice(db: PrismaClient, fingerprintId: string): Promise<number> {
  return db.trialDevice.count({ where: { visitorIdHash: hashFingerprint(fingerprintId) } });
}

/**
 * Called before creating an account. Without a fingerprint (script blocked,
 * API client) there is nothing to count against, so it is allowed — the same
 * as before this limit existed.
 */
export async function assertDeviceCanCreateAccount(db: PrismaClient, fingerprintId?: string | null): Promise<void> {
  if (!fingerprintId) return;
  if ((await accountsOnDevice(db, fingerprintId)) >= MAX_ACCOUNTS_PER_DEVICE) throw new DeviceAccountLimitError();
}

/**
 * Records the device an account was first seen on, if the account has none
 * on file yet. Never throws, and never blocks a sign-in.
 */
export async function claimTrialDevice(db: PrismaClient, userId: string, fingerprintId?: string | null): Promise<void> {
  if (!fingerprintId) return;
  await db.trialDevice.createMany({ data: [{ visitorIdHash: hashFingerprint(fingerprintId), userId }], skipDuplicates: true });
}
