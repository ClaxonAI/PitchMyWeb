import type { PipelineStage, PrismaClient } from "@pitchmyweb/db";
import { emitEvent } from "../observability/events";
import { enqueueSessionCommand } from "./queue";

// WhatsApp is linked per campaign, not once. When a campaign has finished —
// every pitch it started has a final outcome — PitchMyWeb unlinks the
// user's WhatsApp (logs the device out, wipes the stored credentials), and
// the next campaign asks them to link it again (assertWhatsAppConnected).
//
// "Finished" has to wait for the last delivery receipt, not the last send:
// receipts only arrive over the linked device, and a pitch that never gets
// one is failed as not_delivered and refunded after a day — so unlinking at
// the moment of sending would refund pitches that actually arrived. For the
// same reason nothing is unlinked while any other campaign of the user's is
// still working: they share the one linked number.

/** Stages in which a pitch still needs the linked WhatsApp (or may come to). */
const WORKING_STAGES: PipelineStage[] = ["SELECTED", "BUILDING_SITE", "SITE_PUBLISHED", "RECORDING", "VIDEO_UPLOADED", "DELIVERY_QUEUED"];
/** Discovery still running: auto-selection may yet start pitches. */
const DISCOVERING = ["RUNNING", "PROCESSING"] as const;

export type ReleaseDeps = {
  disconnect: (accountId: string) => Promise<void>;
};

const defaultDeps: ReleaseDeps = {
  disconnect: (accountId) => enqueueSessionCommand({ type: "disconnect", accountId }),
};

/**
 * A pitch that is still working, or FAILED but waiting for an automatic
 * retry (its credit is unresolved). LINK_READY is not counted: a Direct
 * pitch is sent by the user from their own phone, not through the link.
 */
async function hasUnfinishedPitches(db: PrismaClient, where: { campaignId: string } | { campaign: { userId: string } }): Promise<boolean> {
  const count = await db.leadPipeline.count({
    where: {
      ...where,
      OR: [{ stage: { in: WORKING_STAGES } }, { stage: "FAILED", creditOutcome: null, batchId: { not: null } }],
    },
  });
  return count > 0;
}

async function userHasWorkInFlight(db: PrismaClient, userId: string): Promise<boolean> {
  const discovering = await db.campaign.count({ where: { userId, status: { in: [...DISCOVERING] } } });
  if (discovering > 0) return true;
  return hasUnfinishedPitches(db, { campaign: { userId } });
}

/**
 * Marks every finished campaign (optionally just one) as released, and
 * unlinks the owner's WhatsApp once none of their campaigns has work left.
 * Idempotent and safe to call from anywhere a pitch may have just resolved;
 * the maintenance job sweeps it as the backstop. Returns how many accounts
 * were unlinked.
 */
export async function releaseWhatsAppForFinishedCampaigns(
  db: PrismaClient,
  filter: { campaignId?: string } = {},
  deps: ReleaseDeps = defaultDeps,
): Promise<number> {
  const candidates = await db.campaign.findMany({
    where: { whatsappReleasedAt: null, status: { in: ["COMPLETED", "FAILED"] }, ...(filter.campaignId ? { id: filter.campaignId } : {}) },
    select: { id: true, userId: true },
    take: 200,
  });

  const usersToRelease = new Set<string>();
  for (const campaign of candidates) {
    if (await hasUnfinishedPitches(db, { campaignId: campaign.id })) continue;
    // Claimed once: whichever caller flips it from null does the unlink.
    const claimed = await db.campaign.updateMany({ where: { id: campaign.id, whatsappReleasedAt: null }, data: { whatsappReleasedAt: new Date() } });
    if (claimed.count === 1) usersToRelease.add(campaign.userId);
  }

  let unlinked = 0;
  for (const userId of usersToRelease) {
    // Another campaign still needs the number; its own completion unlinks it.
    if (await userHasWorkInFlight(db, userId)) continue;
    const accounts = await db.whatsAppAccount.findMany({
      where: { userId, status: { notIn: ["DISCONNECTED"] } },
      select: { id: true },
    });
    for (const account of accounts) {
      await deps.disconnect(account.id);
      unlinked += 1;
    }
    // The worker sets DISCONNECTED when it processes the command; set it now
    // too so a campaign started in the meantime is asked to link again
    // rather than queueing sends for a socket that is about to close.
    await db.whatsAppAccount.updateMany({ where: { userId, status: { notIn: ["DISCONNECTED"] } }, data: { status: "DISCONNECTED" } });
    if (accounts.length > 0) emitEvent("whatsapp.released_after_campaign", { userId, accounts: accounts.length });
  }
  return unlinked;
}

/** Best-effort trigger for callers that just resolved a pitch: never throws. */
export async function releaseWhatsAppIfCampaignFinished(db: PrismaClient, campaignId: string, deps?: ReleaseDeps): Promise<void> {
  try {
    await releaseWhatsAppForFinishedCampaigns(db, { campaignId }, deps);
  } catch (error) {
    console.error(`Could not release WhatsApp after campaign ${campaignId}:`, error instanceof Error ? error.message : error);
  }
}
