import type { PrismaClient } from "@pitchmyweb/db";
import { ALLOWED, deny, type PolicyDecision } from "@pitchmyweb/contracts";
import type { WorkerConfig } from "../config.js";

// The authoritative outreach gate, evaluated immediately before every send.
//
// Counting comes from Postgres rather than Redis counters. That is exact,
// survives a wiped cache, and is race-free here for a structural reason: a
// message can only be sent by the worker that holds the session lock for its
// account, and that worker sends one at a time — so no two processes are
// ever incrementing the same account's count concurrently. At these volumes
// (tens per hour) the queries are trivial, and both are served by the
// indexes on whatsapp_messages.

/** Statuses that prove an attempt to contact the number actually went out. */
const CONTACTED_STATUSES = ["SENDING", "SENT", "DELIVERED", "READ"] as const;

export type GuardInput = {
  accountId: string;
  userId: string;
  phoneNumber: string;
  /** The account row status, as stored. */
  accountStatus: string;
  /** The owner of the account, for the cross-user check. */
  accountUserId: string;
  /** Whether this process currently holds a connected socket. */
  socketConnected: boolean;
  now?: Date;
};

export class SendGuard {
  constructor(
    private readonly db: PrismaClient,
    private readonly config: WorkerConfig,
  ) {}

  /**
   * Everything that can be decided from the database. `checkNumber` is
   * deliberately not part of this: it costs a network round-trip to
   * WhatsApp, so the send worker runs it last, only once every cheap check
   * has passed.
   */
  async evaluate(input: GuardInput): Promise<PolicyDecision> {
    const now = input.now ?? new Date();

    // A message whose account belongs to somebody else is not a policy
    // decision at all — it is a bug or an attack, and the safe answer is
    // the same either way.
    if (input.accountUserId !== input.userId) {
      return deny("not_connected");
    }
    if (input.accountStatus !== "CONNECTED" || !input.socketConnected) {
      return deny("not_connected");
    }
    if (!/^\d{8,15}$/.test(input.phoneNumber)) {
      return deny("invalid_number");
    }

    const optedOut = await this.db.optOut.findUnique({ where: { phoneNumber: input.phoneNumber } });
    if (optedOut) {
      return deny("opted_out");
    }

    if (this.config.WA_DUPLICATE_WINDOW_HOURS > 0) {
      const since = new Date(now.getTime() - this.config.WA_DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000);
      const duplicate = await this.db.whatsAppMessage.findFirst({
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
    }

    const rate = await this.checkRate(input.accountId, now);
    if (!rate.allowed) return rate.decision;

    return ALLOWED;
  }

  /**
   * Caps and pacing. Separated from `evaluate` because the send worker
   * treats a rate denial differently from every other denial: the message
   * is still perfectly valid, it just has to wait, so the job is re-delayed
   * rather than the message being marked BLOCKED.
   */
  async checkRate(accountId: string, now = new Date()): Promise<{ allowed: true } | { allowed: false; decision: PolicyDecision; retryAfterMs: number }> {
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [lastSent, sentInHour, sentInDay] = await Promise.all([
      this.db.whatsAppMessage.findFirst({
        where: { accountId, sentAt: { not: null } },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      }),
      this.db.whatsAppMessage.count({ where: { accountId, sentAt: { gte: hourAgo } } }),
      this.db.whatsAppMessage.count({ where: { accountId, sentAt: { gte: dayAgo } } }),
    ]);

    if (sentInDay >= this.config.WA_MAX_PER_DAY) {
      // Retry after the oldest send in the window ages out, rounded up to
      // the next hour so a burst of jobs does not all wake at once.
      return { allowed: false, decision: deny("rate_limited"), retryAfterMs: 60 * 60 * 1000 };
    }
    if (sentInHour >= this.config.WA_MAX_PER_HOUR) {
      return { allowed: false, decision: deny("rate_limited"), retryAfterMs: 10 * 60 * 1000 };
    }

    const gapMs = this.config.WA_MIN_GAP_SECONDS * 1000;
    if (gapMs > 0 && lastSent?.sentAt) {
      const elapsed = now.getTime() - lastSent.sentAt.getTime();
      if (elapsed < gapMs) {
        return { allowed: false, decision: deny("rate_limited"), retryAfterMs: gapMs - elapsed };
      }
    }

    return { allowed: true };
  }
}
