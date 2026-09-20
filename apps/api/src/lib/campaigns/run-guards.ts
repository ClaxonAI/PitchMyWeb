import type { PrismaClient } from "@pitchmyweb/db";
import { DailyRunLimitError, LeadDiscoveryPausedError } from "../errors";
import { emitEvent } from "../observability/events";

// Operational guards checked by POST /api/campaigns/:id/run before a run
// starts. Both fail before any campaign state changes.
//
//   LEAD_DISCOVERY_PAUSED=true                 kill switch (503)
//   MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY=20      rolling 24h cap per user (429); 0 = unlimited
//
// The daily cap is a DB count, so it holds across any number of API
// instances. Two requests racing at the exact limit can both pass (one run
// over the cap at most); that is acceptable for a spend guard and avoids a
// lock on every run.

export const DEFAULT_MAX_RUNS_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

type Env = Record<string, string | undefined>;

export function isLeadDiscoveryPaused(env: Env = process.env): boolean {
  return ["1", "true", "yes", "on"].includes((env.LEAD_DISCOVERY_PAUSED ?? "").trim().toLowerCase());
}

export function maxRunsPerDay(env: Env = process.env): number {
  const raw = env.MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_RUNS_PER_DAY;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_RUNS_PER_DAY;
}

export type RunGuardInput = {
  userId: string;
  campaignId: string;
  /** A retry of an existing run is a replay, not a new run: guards don't apply. */
  idempotencyKey?: string;
};

export async function assertCampaignRunAllowed(
  db: PrismaClient,
  { userId, campaignId, idempotencyKey }: RunGuardInput,
  options: { env?: Env; now?: Date } = {},
): Promise<void> {
  const env = options.env ?? process.env;

  if (idempotencyKey) {
    const existing = await db.campaignExecution.findUnique({
      where: { campaignId_idempotencyKey: { campaignId, idempotencyKey } },
      select: { id: true },
    });
    if (existing) return;
  }

  if (isLeadDiscoveryPaused(env)) {
    emitEvent("lead_discovery.run_blocked", { userId, reason: "paused" }, { level: "warn" });
    throw new LeadDiscoveryPausedError();
  }

  const limit = maxRunsPerDay(env);
  if (limit === 0) return;

  const since = new Date((options.now ?? new Date()).getTime() - DAY_MS);
  const recentRuns = await db.campaignExecution.count({
    where: { startedAt: { gte: since }, campaign: { userId } },
  });
  if (recentRuns >= limit) {
    emitEvent("lead_discovery.run_blocked", { userId, reason: "daily_limit", limit, recentRuns }, { level: "warn" });
    throw new DailyRunLimitError(limit);
  }
}
