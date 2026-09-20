import { Queue } from "bullmq";
import { QUEUE_RECONNECT, createRedisConnection, queuePrefix, type ReconnectJob } from "@pitchmyweb/contracts";
import { ObjectStorage, storageConfigFromEnv } from "@pitchmyweb/storage";
import { getConfig } from "./config.js";
import { disconnectDb, getDb } from "./db.js";
import { logger, sanitizeError } from "./logger.js";
import { BaileysProvider } from "./providers/baileys.provider.js";
import { PostgresAuthStateRepository } from "./session/auth-state.repository.js";
import { SessionManager } from "./session/session.manager.js";
import { isTransientNetworkError } from "./transient-error.js";
import { createReconnectWorker } from "./workers/reconnect.worker.js";
import { createSendWorker } from "./workers/send.worker.js";
import { createSessionWorker } from "./workers/session.worker.js";
import { InboundHandler } from "./workers/inbound.handler.js";

// Boot order matters:
//   config -> db/redis -> restoreAll() -> workers -> shutdown hooks
//
// Sessions are restored *before* the workers start consuming. A send job
// picked up while its account is still mid-restore would find no socket and
// fail for no good reason, so the queues stay closed until the sockets that
// can serve them are back.

async function main(): Promise<void> {
  const config = getConfig();
  logger.info({ nodeEnv: config.NODE_ENV }, "starting whatsapp worker");

  const db = getDb();

  // Separate connections by role. BullMQ workers issue blocking commands
  // that monopolize a connection, so sharing one with the lock renewals or
  // the event publisher would stall them behind a BRPOPLPUSH.
  const queueConnection = createRedisConnection(config.REDIS_URL);
  const workerConnection = createRedisConnection(config.REDIS_URL);
  const lockConnection = createRedisConnection(config.REDIS_URL);
  const publishConnection = createRedisConnection(config.REDIS_URL);

  const authRepo = new PostgresAuthStateRepository(db, config.authEncryptionKey, config.WA_AUTH_KEY_VERSION);
  const provider = new BaileysProvider(authRepo);
  const inbound = new InboundHandler(db);
  const reconnectQueue = new Queue<ReconnectJob>(QUEUE_RECONNECT, { connection: queueConnection, prefix: queuePrefix() });

  const sessions = new SessionManager(db, publishConnection, lockConnection, provider, authRepo, inbound, reconnectQueue, config);

  await sessions.restoreAll();

  // Video attachments are read from object storage. Without STORAGE_* the
  // worker still sends text; a video message then fails with a clear reason.
  const storageConfig = storageConfigFromEnv();
  const media = storageConfig ? new ObjectStorage(storageConfig) : null;
  if (!media) logger.warn("object storage is not configured; video messages will fail");

  const workers = [
    createSessionWorker(workerConnection, sessions, config),
    createSendWorker(workerConnection, db, provider, sessions, config, media),
    createReconnectWorker(workerConnection, sessions),
  ];

  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      logger.error({ queue: worker.name, jobId: job?.id, err: sanitizeError(error) }, "job failed");
    });
    worker.on("error", (error) => {
      logger.error({ queue: worker.name, err: sanitizeError(error) }, "worker error");
    });
  }

  logger.info({ queues: workers.map((worker) => worker.name) }, "workers started");

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    try {
      // Stop taking new work first, then close the sockets. Closing
      // sockets releases the session locks but leaves the stored
      // credentials and the CONNECTED/RECONNECTING status alone, which is
      // what lets the next boot restore them without a QR scan.
      await Promise.all(workers.map((worker) => worker.close()));
      await sessions.shutdown();
      await reconnectQueue.close();
      await Promise.all([
        queueConnection.quit(),
        workerConnection.quit(),
        lockConnection.quit(),
        publishConnection.quit(),
      ]);
      await disconnectDb();
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, "error during shutdown");
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: sanitizeError(reason) }, "unhandled rejection");
  });

  // Baileys talks to WhatsApp through undici, whose streams emit `error`
  // events that nothing in the library subscribes to. An ordinary
  // ECONNRESET on one account's socket therefore arrives here as an
  // uncaught exception — and with the default behaviour it would kill the
  // process, dropping every *other* tenant's session along with it. That is
  // the wrong trade for a multi-tenant session host: the affected socket
  // still emits its own close event, which schedules a reconnect, so the
  // right move is to log loudly and keep serving everyone else.
  //
  // Only recognisably transient network faults are survived. Anything else
  // may have left the process in an undefined state, so it exits non-zero
  // and lets the supervisor restart it — restoreAll() rebuilds the sessions
  // on the way back up.
  process.on("uncaughtException", (error) => {
    if (isTransientNetworkError(error)) {
      logger.warn({ err: sanitizeError(error) }, "transient socket error; sessions kept");
      return;
    }
    logger.fatal({ err: sanitizeError(error) }, "uncaught exception; exiting for a clean restart");
    process.exit(1);
  });
}

main().catch((error) => {
  logger.fatal({ err: sanitizeError(error) }, "worker failed to start");
  process.exit(1);
});
