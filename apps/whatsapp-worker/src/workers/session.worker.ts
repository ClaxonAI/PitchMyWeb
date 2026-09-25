import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { QUEUE_SESSION, queuePrefix, sessionCommandSchema, type SessionCommand } from "@pitchmyweb/contracts";
import type { WorkerConfig } from "../config.js";
import { logger } from "../logger.js";
import type { SessionManager } from "../session/session.manager.js";

// Connect / pairing-code / disconnect, driven by the API.
//
// Every command is idempotent at the session-manager level, which matters
// because a user who clicks "Connect" twice produces two jobs and must not
// get two sockets.

export function createSessionWorker(connection: Redis, sessions: SessionManager, config: WorkerConfig): Worker<SessionCommand> {
  return new Worker<SessionCommand>(
    QUEUE_SESSION,
    async (job: Job<SessionCommand>) => {
      const command = sessionCommandSchema.parse(job.data);
      logger.info({ accountId: command.accountId, type: command.type }, "session command");

      switch (command.type) {
        case "connect":
          await sessions.connect(command.accountId);
          return;
        case "pairing-code":
          // The schema guarantees phoneNumber is present for this variant.
          await sessions.requestPairingCode(command.accountId, command.phoneNumber!);
          return;
        case "disconnect":
          await sessions.disconnect(command.accountId, { expectedLinkedAt: command.expectedLinkedAt });
          return;
      }
    },
    {
      connection,
      prefix: queuePrefix(),
      concurrency: config.WA_SESSION_CONCURRENCY,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  );
}
