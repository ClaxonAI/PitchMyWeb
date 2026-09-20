import { Boom } from "@hapi/boom";
import { DisconnectReason } from "baileys";

// Pure mapping from "the socket closed" to "what should happen next".
// Kept free of any I/O so the policy is directly testable: every branch
// below is a decision the status machine makes, and getting one wrong
// (treating a logout as transient, say) means either an account that never
// reconnects or one that retries forever against revoked credentials.

export type DisconnectOutcome =
  // Transient: schedule a reconnect with backoff, keep the stored auth.
  | { action: "reconnect"; reason: string }
  // WhatsApp revoked this device: wipe the auth, the user must relink.
  | { action: "logged_out"; reason: string }
  // Not recoverable by retrying: surface the error and stop.
  | { action: "fatal"; reason: string };

/** Extracts the numeric status code Baileys attaches to a close error. */
export function statusCodeOf(error: unknown): number | undefined {
  if (error instanceof Boom) {
    return error.output?.statusCode;
  }
  const output = (error as { output?: { statusCode?: unknown } } | undefined)?.output;
  return typeof output?.statusCode === "number" ? output.statusCode : undefined;
}

export function classifyDisconnect(error: unknown): DisconnectOutcome {
  const code = statusCodeOf(error);

  switch (code) {
    // The user removed this device in WhatsApp, or the credentials were
    // rejected. Reconnecting cannot succeed — the stored keys are dead.
    case DisconnectReason.loggedOut:
      return { action: "logged_out", reason: "This device was unlinked in WhatsApp" };

    // Another session took over this device slot. Retrying would fight the
    // other client for the slot, so this is terminal for us too.
    case DisconnectReason.connectionReplaced:
      return { action: "fatal", reason: "The connection was replaced by another session" };

    case DisconnectReason.forbidden:
      return { action: "fatal", reason: "WhatsApp refused this connection" };

    case DisconnectReason.multideviceMismatch:
      return { action: "logged_out", reason: "WhatsApp requires this device to be linked again" };

    // Baileys' normal "reconnect now" handshake signal, plus the ordinary
    // network-level closes. All expected, all retryable.
    case DisconnectReason.restartRequired:
    case DisconnectReason.connectionClosed:
    case DisconnectReason.connectionLost:
    case DisconnectReason.timedOut:
    case DisconnectReason.unavailableService:
      return { action: "reconnect", reason: "Connection interrupted" };

    // A corrupt Signal session. Baileys recovers by reconnecting and
    // rebuilding it, so this is retryable rather than fatal.
    case DisconnectReason.badSession:
      return { action: "reconnect", reason: "Session needs to be rebuilt" };

    // No status code at all: a plain socket error or an abrupt close.
    // Treated as transient, because the alternative — declaring a working
    // account dead on an unlabelled network blip — is the worse failure.
    default:
      return { action: "reconnect", reason: "Connection closed unexpectedly" };
  }
}
