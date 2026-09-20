import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { QUEUE_RECONNECT, queuePrefix, reconnectJobSchema, type ReconnectJob } from "@pitchmyweb/contracts";
import { logger } from "../logger.js";
import type { SessionManager } from "../session/session.manager.js";

// Retries a dropped session. The backoff itself lives in
// SessionManager.scheduleReconnect (BullMQ holds the delay, so a pending
// retry survives a restart); this worker just runs the attempt when its
// delay elapses.
//
// Concurrency is 1 on purpose. Reconnect storms after a network outage are
// exactly when hammering WhatsApp is most likely to look abusive, so
// attempts are serialized within a process.

export function createReconnectWorker(connection: Redis, sessions: SessionManager): Worker<ReconnectJob> {
  return new Worker<ReconnectJob>(
    QUEUE_RECONNECT,
    async (job: Job<ReconnectJob>) => {
      const { accountId, attempt } = reconnectJobSchema.parse(job.data);
      logger.info({ accountId, attempt }, "reconnect attempt");
      await sessions.reconnect(accountId, attempt);
    },
    {
      connection,
      prefix: queuePrefix(),
      concurrency: 1,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  );
}
