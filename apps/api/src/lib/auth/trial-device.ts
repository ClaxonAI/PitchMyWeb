import { createHash } from "node:crypto";
import type { PrismaClient } from "@pitchmyweb/db";

export function hashFingerprint(fingerprintId: string): string {
  return createHash("sha256").update(fingerprintId).digest("hex");
}

/**
 * Records the device an account was first seen on, if neither the device nor
 * the account has one on file yet. Never throws: one-account-per-device is
 * enforced where accounts are created (register, first social sign-in), and
 * an account that already exists must be able to sign in from any device.
 * This used to throw for a device claimed by someone else, and fail on the
 * unique userId for an account's second device, which locked people out of
 * their own accounts on a new phone or after a browser update changed the
 * fingerprint.
 */
export async function claimTrialDevice(db: PrismaClient, userId: string, fingerprintId?: string): Promise<void> {
  if (!fingerprintId) return;
  await db.trialDevice.createMany({ data: [{ visitorIdHash: hashFingerprint(fingerprintId), userId }], skipDuplicates: true });
}
