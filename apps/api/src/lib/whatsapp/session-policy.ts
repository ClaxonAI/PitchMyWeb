import type { PrismaClient, WhatsAppStatus } from "@pitchmyweb/db";
import { WhatsAppNotConnectedError } from "../errors";

export { WhatsAppNotConnectedError };
import { emitEvent } from "../observability/events";
import { ACTIVE_STAGES } from "../pipeline/pipeline.service";
import { enqueueSessionCommand } from "./queue";

// How long a linked WhatsApp number stays signed in.
//
// A linked device can read and send as the user for as long as it stays
// linked, so by default it lives exactly as long as the campaign that needed
// it: once nothing is left to send, the number is signed out — the worker
// unlinks the device on WhatsApp and wipes the stored credentials, the same
// path as the Disconnect button. The next campaign asks the user to link
// again. There is no "stay signed in" option: every campaign starts with a
// fresh link.
//
// This never cuts off a campaign mid-send: a number is only signed out
// once the user has no campaign still discovering, building, recording or
// sending, and no message still queued. Delivery receipts only arrive over a
// live socket, so "still sending" includes waiting for them.
//
// Enforced by sweepWhatsAppSessions (every pipeline-maintenance run, i.e.
// every few minutes) and settleWhatsAppSession (right after a user's pitch
// finishes, so the sign-out follows the campaign by seconds when the
// dashboard is open).

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A number linked "for this campaign" that never ends up sending anything
 * (the user linked it and walked away, or discovery found nobody to pitch)
 * is signed out after this long rather than staying linked indefinitely.
 */
export const UNUSED_LINK_TIMEOUT_MS = DAY_MS;

/**
 * Work older than this is treated as dead rather than in flight, so one row
 * stuck by a crash can never keep a number linked forever. Every legitimate
 * stage finishes well inside it — the longest wait, a delivery receipt, is
 * capped at 24 hours (pipeline.service.ts DELIVERY_RECEIPT_TIMEOUT_MS).
 */
export const ACTIVE_WORK_MAX_AGE_MS = 2 * DAY_MS;

/**
 * Discovery marks a campaign COMPLETED and only then creates its auto-selected
 * batch (run.service.ts -> onDiscoveryCompleted). A campaign that finished
 * this recently with no batch yet is about to start sending.
 */
export const AUTO_SELECTION_GRACE_MS = 10 * 60 * 1000;

/**
 * Accounts that hold credentials for a device linked on the user's phone:
 * connected, reconnecting, or stopped on an error with its keys still
 * stored (reconnects exhausted, a lost session lock). The last group has no
 * live socket, but its credentials would otherwise sit in the database
 * indefinitely. A link attempt in progress (CONNECTING, QR_READY, ...) is
 * never touched.
 */
const SIGNED_IN_STATUSES: WhatsAppStatus[] = ["CONNECTED", "RECONNECTING"];
const SIGNED_IN_WHERE = { OR: [{ status: { in: SIGNED_IN_STATUSES } }, { status: "ERROR" as const, authKeys: { some: {} } }] };

/** Statuses a campaign may send from; RECONNECTING recovers on its own. */
const SENDABLE_STATUSES: WhatsAppStatus[] = ["CONNECTED", "RECONNECTING"];

/**
 * "stay_linked_expired" is only ever read back: the 3-day opt-in it came from
 * has been removed, but accounts signed out under it still carry the reason.
 */
export type SignOutReason = "campaign_finished" | "unused";

export type SessionDecision =
  | { action: "keep"; reason: "sending" | "waiting_for_campaign" }
  | { action: "sign_out"; reason: SignOutReason };

/**
 * The whole policy, as a pure function of what the sweep observed. Active
 * sending wins over everything; then "a campaign finished since this login";
 * then the unused-link timeout.
 */
export function decideSession(input: {
  now: Date;
  linkedAt: Date | null;
  activeSending: boolean;
  campaignFinishedSinceLink: boolean;
}): SessionDecision {
  if (input.activeSending) return { action: "keep", reason: "sending" };
  if (input.campaignFinishedSinceLink) return { action: "sign_out", reason: "campaign_finished" };
  // No linkedAt means the number was linked before this policy existed and
  // was never backfilled; it gets no grace beyond the timeout either way.
  if (!input.linkedAt || input.now.getTime() - input.linkedAt.getTime() >= UNUSED_LINK_TIMEOUT_MS) {
    return { action: "sign_out", reason: "unused" };
  }
  return { action: "keep", reason: "waiting_for_campaign" };
}

/**
 * Whether any of this user's WhatsApp-delivered (Auto) campaigns still needs
 * the linked number: discovery running (or just finished and about to
 * auto-select), a batch mid-reservation, a pipeline not yet resolved
 * (including a failed one still waiting for its automatic retry), or a
 * message still queued or sending.
 */
export async function hasActiveCampaignSending(db: PrismaClient, userId: string, now = new Date()): Promise<boolean> {
  const fresh = new Date(now.getTime() - ACTIVE_WORK_MAX_AGE_MS);
  const justFinished = new Date(now.getTime() - AUTO_SELECTION_GRACE_MS);

  const [discovering, awaitingSelection, reserving, pipelines, messages] = await Promise.all([
    db.campaign.count({ where: { userId, deliveryMode: "AUTO", status: { in: ["RUNNING", "PROCESSING"] }, updatedAt: { gte: fresh } } }),
    db.campaign.count({
      where: { userId, deliveryMode: "AUTO", selectionMode: "AUTO", status: "COMPLETED", updatedAt: { gte: justFinished }, pitchBatches: { none: {} } },
    }),
    db.pitchBatch.count({ where: { userId, status: "PROCESSING", reservedCount: 0, createdAt: { gte: justFinished }, campaign: { deliveryMode: "AUTO" } } }),
    db.leadPipeline.count({
      where: {
        campaign: { userId, deliveryMode: "AUTO" },
        updatedAt: { gte: fresh },
        OR: [{ stage: { in: ACTIVE_STAGES } }, { stage: "FAILED", creditOutcome: null, batchId: { not: null } }],
      },
    }),
    db.whatsAppMessage.count({ where: { userId, status: { in: ["QUEUED", "SENDING"] }, updatedAt: { gte: fresh } } }),
  ]);
  return discovering + awaitingSelection + reserving + pipelines + messages > 0;
}

async function campaignFinishedSince(db: PrismaClient, userId: string, since: Date | null): Promise<boolean> {
  if (!since) return false;
  const finished = await db.pitchBatch.count({
    where: { userId, status: "COMPLETED", completedAt: { gte: since }, campaign: { deliveryMode: "AUTO" } },
  });
  return finished > 0;
}

type PolicyAccount = { id: string; userId: string; linkedAt: Date | null };

export type SessionPolicyDeps = { enqueueSessionCommand: typeof enqueueSessionCommand };
const defaultDeps: SessionPolicyDeps = { enqueueSessionCommand };

const POLICY_FIELDS = { id: true, userId: true, linkedAt: true } as const;

async function applyPolicy(db: PrismaClient, account: PolicyAccount, now: Date, deps: SessionPolicyDeps): Promise<SessionDecision> {
  const decision = decideSession({
    now,
    linkedAt: account.linkedAt,
    activeSending: await hasActiveCampaignSending(db, account.userId, now),
    campaignFinishedSinceLink: await campaignFinishedSince(db, account.userId, account.linkedAt),
  });
  if (decision.action === "sign_out") await signOut(db, account, decision.reason, now, deps);
  return decision;
}

/**
 * Records why, then asks the worker to unlink the device. The command
 * carries the login it was decided for (linkedAt), and the worker skips it if
 * the user has linked again since — so a sign-out that sat in the queue can
 * never end a newer session. The job id is bucketed by ten minutes: a sweep
 * every few minutes re-asks at most once per bucket while the worker is busy
 * or down, and a failed job cannot block the next bucket's attempt.
 */
async function signOut(db: PrismaClient, account: PolicyAccount, reason: SignOutReason, now: Date, deps: SessionPolicyDeps): Promise<void> {
  await db.whatsAppAccount.update({ where: { id: account.id }, data: { logoutReason: reason } });
  await deps.enqueueSessionCommand(
    { type: "disconnect", accountId: account.id, ...(account.linkedAt ? { expectedLinkedAt: account.linkedAt.toISOString() } : {}) },
    { jobId: `auto-signout-${account.id}-${Math.floor(now.getTime() / (10 * 60 * 1000))}` },
  );
  emitEvent("whatsapp.signed_out", { accountId: account.id, userId: account.userId, reason });
}

/**
 * Applies the policy to every signed-in account. Never throws for one
 * account: a bad row must not stop everyone else from being signed out.
 */
export async function sweepWhatsAppSessions(
  db: PrismaClient,
  now = new Date(),
  deps: SessionPolicyDeps = defaultDeps,
): Promise<{ checked: number; signedOut: number }> {
  const accounts = await db.whatsAppAccount.findMany({
    where: SIGNED_IN_WHERE,
    select: POLICY_FIELDS,
    take: 500,
  });
  let signedOut = 0;
  for (const account of accounts) {
    try {
      const decision = await applyPolicy(db, account, now, deps);
      if (decision.action === "sign_out") signedOut += 1;
    } catch (error) {
      console.error(`Could not apply the WhatsApp session policy to ${account.id}:`, error instanceof Error ? error.message : error);
    }
  }
  return { checked: accounts.length, signedOut };
}

/**
 * The same policy for one user, called the moment one of their pitches
 * resolves. Never throws: it runs on the tail of pipeline bookkeeping that
 * has already committed, and the scheduled sweep is the backstop.
 */
export async function settleWhatsAppSession(db: PrismaClient, userId: string, now = new Date(), deps: SessionPolicyDeps = defaultDeps): Promise<void> {
  try {
    const accounts = await db.whatsAppAccount.findMany({ where: { userId, ...SIGNED_IN_WHERE }, select: POLICY_FIELDS });
    for (const account of accounts) await applyPolicy(db, account, now, deps);
  } catch (error) {
    console.error(`Could not settle the WhatsApp session for user ${userId}:`, error instanceof Error ? error.message : error);
  }
}

/**
 * Campaigns that deliver through WhatsApp need a linked number before they
 * start: the policy above signs the number out after every campaign, so each
 * one is preceded by a link.
 */
export async function assertWhatsAppReady(db: PrismaClient, userId: string, campaign: { deliveryMode: "AUTO" | "DIRECT" }): Promise<void> {
  // Direct campaigns hand the user wa.me links to send themselves.
  if (campaign.deliveryMode !== "AUTO") return;
  const ready = await db.whatsAppAccount.count({ where: { userId, status: { in: SENDABLE_STATUSES } } });
  if (ready === 0) throw new WhatsAppNotConnectedError();
}
