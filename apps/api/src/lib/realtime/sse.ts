import { createRedisConnection } from "@pitchmyweb/contracts";

const KEEPALIVE_MS = 25_000;

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export type CreateSseStreamOptions<T> = {
  channel: string;
  signal: AbortSignal;
  redisUrl?: string;
  parse: (raw: string) => T | null;
  eventName: (event: T) => string;
  /** Optional SSE frame sent if Redis subscribe fails. */
  subscribeErrorFrame?: string;
};

/**
 * A ReadableStream of SSE frames for one Redis pub/sub channel.
 *
 * Each stream gets its own Redis subscriber connection. A connection in
 * subscriber mode cannot run ordinary commands, so it cannot be shared with
 * the queue producers.
 */
export function createSseStream<T>(options: CreateSseStreamOptions<T>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const url = options.redisUrl ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6381";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const subscriber = createRedisConnection(url);
      let closed = false;
      let keepalive: ReturnType<typeof setInterval> | undefined;

      const cleanup = async (): Promise<void> => {
        if (closed) return;
        closed = true;
        if (keepalive) clearInterval(keepalive);
        try {
          await subscriber.unsubscribe(options.channel);
        } catch {
          // The connection may already be gone; quit() below covers it.
        }
        subscriber.disconnect();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime when the client went away.
        }
      };

      const send = (payload: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          void cleanup();
        }
      };

      options.signal.addEventListener("abort", () => void cleanup(), { once: true });

      subscriber.on("message", (incoming, raw) => {
        if (incoming !== options.channel) return;
        const event = options.parse(raw);
        if (!event) return;
        send(`event: ${options.eventName(event)}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      try {
        await subscriber.subscribe(options.channel);
      } catch {
        if (options.subscribeErrorFrame) send(options.subscribeErrorFrame);
        await cleanup();
        return;
      }

      send(": connected\n\n");
      keepalive = setInterval(() => send(": keepalive\n\n"), KEEPALIVE_MS);
    },
  });
}
