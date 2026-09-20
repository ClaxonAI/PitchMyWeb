// Decides whether an uncaught exception is an ordinary network fault from a
// WhatsApp socket, or something that should take the process down.
//
// It lives in its own module rather than in main.ts because main.ts calls
// main() at import time — a test importing it would boot the whole worker.

const NETWORK_CODES = [
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_SOCKET",
];

/**
 * Matched on the codes undici and Node's net stack actually produce.
 * `terminated` is undici's own wrapper around a connection that went away
 * mid-request, with the real code tucked into `cause`.
 */
export function isTransientNetworkError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  // Walk the cause chain, guarding against a self-referential `cause`.
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && NETWORK_CODES.includes(code)) return true;
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string" && (message === "terminated" || NETWORK_CODES.some((c) => message.includes(c)))) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
