import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import {
  QUEUE_SEND,
  QUEUE_SESSION,
  createRedisConnection,
  queuePrefix,
  sendJobSchema,
  sessionCommandSchema,
  type SendJob,
  type SessionCommand,
} from "@pitchmyweb/contracts";

// The API is a producer only: it enqueues commands and never touches a
// WhatsApp socket. There is no `baileys` import anywhere under apps/api, and
// this file is the whole of the API's coupling to the worker.
//
// Connections are lazy and cached per process. Next route handlers run in a
// long-lived server process, so opening a Redis connection per request would
// exhaust the server under any real traffic.

const globalForQueues = globalThis as unknown as {
  waRedis?: Redis;
  waSessionQueue?: Queue<SessionCommand>;
  waSendQueue?: Queue<SendJob>;
};

function redisUrl(): string {
  return process.env.REDIS_URL ?? "redis://127.0.0.1:6381";
}

function connection(): Redis {
  globalForQueues.waRedis ??= createRedisConnection(redisUrl());
  return globalForQueues.waRedis;
}

export function sessionQueue(): Queue<SessionCommand> {
  globalForQueues.waSessionQueue ??= new Queue<SessionCommand>(QUEUE_SESSION, { connection: connection(), prefix: queuePrefix() });
  return globalForQueues.waSessionQueue;
}

export function sendQueue(): Queue<SendJob> {
  globalForQueues.waSendQueue ??= new Queue<SendJob>(QUEUE_SEND, { connection: connection(), prefix: queuePrefix() });
  return globalForQueues.waSendQueue;
}

/**
 * Enqueues a session command. Payloads are validated here as well as in the
 * worker, so a malformed job never reaches Redis in the first place.
 */
export async function enqueueSessionCommand(command: SessionCommand): Promise<void> {
  const payload = sessionCommandSchema.parse(command);
  await sessionQueue().add(payload.type, payload, {
    removeOnComplete: true,
    removeOnFail: 100,
    attempts: 1,
  });
}

export async function enqueueSend(job: SendJob): Promise<void> {
  const payload = sendJobSchema.parse(job);
  await sendQueue().add("send", payload, {
    // The message id is the job id, so a double-submitted message cannot
    // become two sends: BullMQ ignores an add() for an id it already has.
    // Hyphen, not colon: BullMQ rejects a custom id containing ":" because
    // it builds its own Redis keys with that separator.
    jobId: `send-${payload.messageId}`,
    removeOnComplete: true,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
  });
}
