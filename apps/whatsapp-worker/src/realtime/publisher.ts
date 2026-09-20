import type { Redis } from "ioredis";
import { eventsChannel, type WaEvent } from "@pitchmyweb/contracts";
import { logger, sanitizeError } from "../logger.js";

// Worker -> Redis pub/sub -> API SSE -> browser.
//
// Publishing is deliberately best-effort. Postgres is the source of truth
// for session state; these events only make the UI update without polling.
// A publish that fails (Redis restarting, no subscriber attached) must never
// fail the operation that produced it — the browser falls back to polling
// /status and converges on the same answer.

export class EventPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(event: WaEvent): Promise<void> {
    try {
      await this.redis.publish(eventsChannel(event.accountId), JSON.stringify(event));
    } catch (error) {
      logger.warn({ accountId: event.accountId, type: event.type, err: sanitizeError(error) }, "failed to publish WhatsApp event");
    }
  }
}

/** Convenience for building an event with its timestamp already set. */
export function nowIso(): string {
  return new Date().toISOString();
}
