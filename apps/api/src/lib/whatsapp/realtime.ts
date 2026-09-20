import { eventsChannel, parseWaEvent } from "@pitchmyweb/contracts";
import { SSE_HEADERS, createSseStream } from "../realtime/sse";

export type EventStreamOptions = {
  accountId: string;
  /** Aborted when the browser disconnects. */
  signal: AbortSignal;
  redisUrl?: string;
};

export { SSE_HEADERS };

/**
 * A ReadableStream of SSE frames for one WhatsApp account.
 *
 * Authorization happens in the route before this is called: the account is
 * looked up scoped to the session user, so a caller can only ever subscribe
 * to a channel for an account they own.
 */
export function createEventStream(options: EventStreamOptions): ReadableStream<Uint8Array> {
  return createSseStream({
    channel: eventsChannel(options.accountId),
    signal: options.signal,
    redisUrl: options.redisUrl,
    parse: parseWaEvent,
    eventName: (event) => event.type,
    subscribeErrorFrame: `event: ERROR\ndata: ${JSON.stringify({ type: "ERROR", accountId: options.accountId, message: "Live updates are unavailable", at: new Date().toISOString() })}\n\n`,
  });
}
