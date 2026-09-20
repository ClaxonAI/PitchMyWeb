import { createHash } from "node:crypto";
import type { PrismaClient } from "@pitchmyweb/db";
import { ConflictError } from "../errors";

export function hashFingerprint(fingerprintId: string): string {
  return createHash("sha256").update(fingerprintId).digest("hex");
}

export async function claimTrialDevice(db: PrismaClient, userId: string, fingerprintId?: string): Promise<void> {
  if (!fingerprintId) return;
  const visitorIdHash = hashFingerprint(fingerprintId);
  const existing = await db.trialDevice.findUnique({ where: { visitorIdHash } });
  if (existing && existing.userId !== userId) {
    throw new ConflictError("This device has already used the free pitch allowance");
  }
  if (!existing) {
    await db.trialDevice.create({ data: { visitorIdHash, userId } });
  }
}