import { discoveryEventsChannel, parseDiscoveryEvent } from "@pitchmyweb/contracts";
import { createSseStream } from "../realtime/sse";

export type DiscoveryEventStreamOptions = {
  executionId: string;
  signal: AbortSignal;
  redisUrl?: string;
};

export function createDiscoveryEventStream(options: DiscoveryEventStreamOptions): ReadableStream<Uint8Array> {
  return createSseStream({
    channel: discoveryEventsChannel(options.executionId),
    signal: options.signal,
    redisUrl: options.redisUrl,
    parse: parseDiscoveryEvent,
    eventName: (event) => event.stage,
  });
}
