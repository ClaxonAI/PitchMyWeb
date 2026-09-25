import { DelayedError, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import type { PrismaClient } from "@pitchmyweb/db";
import { QUEUE_SEND, queuePrefix, sendJobSchema, type SendJob } from "@pitchmyweb/contracts";
import type { WorkerConfig } from "../config.js";
import { logger, sanitizeError } from "../logger.js";
import type { WhatsAppProvider } from "../providers/whatsapp.provider.js";
import type { SessionManager } from "../session/session.manager.js";
import { SendGuard } from "./send-guard.js";
import { deliverMessage, MediaUnavailableError, type MediaSource } from "./deliver.js";
import { OperationTimeoutError, withTimeout } from "./with-timeout.js";

// One outbound message, end to end:
//
//   re-check the policy -> confirm the number is on WhatsApp -> send ->
//   record SENT -> mirror into the existing Outreach row
//
// Three outcomes, each handled differently:
//   * policy denial      -> the message is BLOCKED with its reason, job done
//   * rate limit         -> the job is re-delayed, the message stays QUEUED
//   * provider failure   -> the message is FAILED, the job throws so BullMQ
//                           can retry it under its own backoff
//
// A rate limit re-delays with `job.moveToDelayed` rather than sleeping: a
// sleeping job holds a worker slot and dies with the process, whereas a
// delayed job is Redis state that outlives a restart.

export function createSendWorker(
  connection: Redis,
  db: PrismaClient,
  provider: WhatsAppProvider,
  sessions: SessionManager,
  config: WorkerConfig,
  /** Attachment store (object storage). Null disables video sends. */
  media: MediaSource | null = null,
): Worker<SendJob> {
  const guard = new SendGuard(db, config);

  return new Worker<SendJob>(
    QUEUE_SEND,
    async (job: Job<SendJob>) => {
      const { messageId } = sendJobSchema.parse(job.data);

      const message = await db.whatsAppMessage.findUnique({
        where: { id: messageId },
        include: { account: { select: { id: true, userId: true, status: true } } },
      });
      if (!message) {
        logger.warn({ messageId }, "send job for a message that no longer exists");
        return;
      }
      // Anything other than QUEUED means somebody already resolved this
      // message — a duplicate job, a cancelled account, a retry after a
      // send that actually succeeded. Re-sending would double-message a
      // real business.
      if (message.status !== "QUEUED") {
        logger.info({ messageId, status: message.status }, "skipping send; message is no longer queued");
        return;
      }

      const decision = await guard.evaluate({
        accountId: message.accountId,
        userId: message.userId,
        phoneNumber: message.phoneNumber,
        accountStatus: message.account.status,
        accountUserId: message.account.userId,
        socketConnected: sessions.isConnected(message.accountId),
      });

      if (!decision.allowed) {
        if (decision.reason === "rate_limited") {
          const rate = await guard.checkRate(message.accountId);
          const retryAfterMs = rate.allowed ? 60_000 : rate.retryAfterMs;
          // `moveToDelayed` requires the job token so BullMQ can prove this
          // worker still owns the job before releasing it back to the queue.
          await job.moveToDelayed(Date.now() + retryAfterMs, job.token);
          logger.info({ messageId, retryAfterMs }, "send delayed by rate limit");
          // Tells BullMQ this worker deliberately gave the job up; without
          // it the job would be marked completed and never run again.
          throw new DelayedError();
        }

        await db.whatsAppMessage.update({
          where: { id: messageId },
          data: { status: "BLOCKED", failureReason: decision.reason },
        });
        logger.info({ messageId, reason: decision.reason }, "message blocked by outreach policy");
        return;
      }

      // Last and most expensive check: a number that is not on WhatsApp
      // cannot be messaged, and finding out costs a round-trip.
      const check = await withTimeout("checkNumber", config.WA_CHECK_NUMBER_TIMEOUT_MS, () =>
        provider.checkNumber(message.accountId, message.phoneNumber),
      );
      if (!check.exists) {
        await db.whatsAppMessage.update({
          where: { id: messageId },
          data: { status: "BLOCKED", failureReason: "invalid_number" },
        });
        logger.info({ messageId }, "message blocked: number is not on WhatsApp");
        return;
      }

      // Claim the message before the network call. If the process dies
      // mid-send, the row reads SENDING rather than QUEUED, so a retry of
      // the job will not send it a second time.
      const claimed = await db.whatsAppMessage.updateMany({
        where: { id: messageId, status: "QUEUED" },
        data: { status: "SENDING" },
      });
      if (claimed.count === 0) {
        logger.info({ messageId }, "another worker claimed this message first");
        return;
      }

      try {
        // Text, or video with the body as caption. The attachment is read
        // inside deliverMessage, i.e. only after the claim above.
        const { providerMessageId, secondary } = await deliverMessage(provider, media, message, {
          textMs: config.WA_SEND_TIMEOUT_MS,
          mediaMs: config.WA_SEND_MEDIA_TIMEOUT_MS,
        });
        if (secondary && !secondary.sent) {
          logger.warn({ messageId, reason: secondary.reason }, "pitch sent, but the second video failed");
        }
        const sentAt = new Date();
        await db.whatsAppMessage.update({
          where: { id: messageId },
          data: { status: "SENT", providerMessageId, sentAt },
        });
        await recordOutreach(db, { leadId: message.leadId, pitchId: message.pitchId, sentAt });
        logger.info({ messageId }, "message sent");
      } catch (error) {
        // A timeout is the one failure where the outcome is genuinely
        // unknown: the call may still land. The row is recorded as FAILED
        // so it stops occupying the pipeline, but the reason says so
        // rather than claiming nothing was sent. The SENDING claim above
        // is what guarantees a retry cannot send it a second time.
        const reason =
          error instanceof OperationTimeoutError
            ? "Timed out waiting for WhatsApp; delivery unconfirmed"
            : error instanceof MediaUnavailableError
              ? error.reason
              : sanitizeError(error, "WhatsApp rejected the message");
        await db.whatsAppMessage.update({
          where: { id: messageId },
          data: { status: "FAILED", failureReason: reason },
        });
        logger.error({ messageId, err: reason }, "send failed");
        // An attachment problem will not fix itself on retry.
        if (error instanceof MediaUnavailableError) return;
        throw error;
      }
    },
    {
      connection,
      prefix: queuePrefix(),
      concurrency: config.WA_SEND_CONCURRENCY,
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 1_000 },
    },
  );
}

/**
 * Mirrors a successful send into the Outreach row the rest of the product
 * already reads (the CRM timeline, analytics). Only lead-linked messages
 * produce one — a test message to your own number is not outreach.
 *
 * The lead status is deliberately untouched: moving a lead to PITCHED on
 * send belongs to the campaign engine in Phase 3, and lifecycle transitions
 * have exactly one owner today (PATCH /api/leads/:id).
 */
async function recordOutreach(
  db: PrismaClient,
  input: { leadId: string | null; pitchId: string | null; sentAt: Date },
): Promise<void> {
  if (!input.leadId) return;
  await db.outreach.create({
    data: {
      leadId: input.leadId,
      pitchId: input.pitchId,
      channel: "WHATSAPP",
      status: "SENT",
      sentAt: input.sentAt,
    },
  });
}
