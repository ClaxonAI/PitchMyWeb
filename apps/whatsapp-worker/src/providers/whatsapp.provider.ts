import type { WaStatus } from "@pitchmyweb/contracts";

// The seam between "how PitchMyWeb thinks about WhatsApp" and "how this
// particular library talks to WhatsApp".
//
// Baileys is an unofficial client pinned to a release candidate (see
// docs/adr/0001-automated-whatsapp-via-baileys.md). Keeping it behind this
// interface means the Cloud API provider planned for Phase 3 is a new file
// implementing the same six methods, not a rewrite of the session manager,
// the workers or the API. Only providers/baileys.provider.ts imports
// `baileys`; nothing else in the monorepo does.

export type ConnectResult = {
  /** True when the account needed no QR — restored from stored credentials. */
  restored: boolean;
};

export type ConnectOptions = {
  /**
   * Link by pairing code instead of QR: the provider asks WhatsApp for an
   * 8-character code for this number (digits, with country code) as soon as
   * the socket is ready to register a device, and reports it through
   * `onPairingCode`. No QR is emitted in this mode.
   */
  pairingPhone?: string;
};

export type SendTextResult = {
  /** The provider's own id for the sent message, used to match receipts. */
  providerMessageId: string;
};

export type SendVideoInput = {
  data: Buffer;
  mimetype: string;
  caption: string;
};

export type NumberCheck = {
  exists: boolean;
  /** The provider-addressable id, when the number exists. */
  jid?: string;
};

/**
 * Callbacks the session manager supplies when opening a connection. The
 * provider never writes to the database or to Redis itself — it reports,
 * and the manager decides what that means.
 */
export type ProviderEvents = {
  onStatus: (status: WaStatus, detail?: { error?: string }) => void | Promise<void>;
  onQr: (qr: string) => void | Promise<void>;
  onPairingCode: (code: string) => void | Promise<void>;
  onConnected: (info: { phoneNumber: string; displayName?: string }) => void | Promise<void>;
  onLoggedOut: (reason: string) => void | Promise<void>;
  onClosed: (outcome: { action: "reconnect" | "logged_out" | "fatal"; reason: string }) => void | Promise<void>;
  onIncomingText: (message: { from: string; text: string; providerMessageId?: string }) => void | Promise<void>;
  onReceipt: (receipt: { providerMessageId: string; status: "DELIVERED" | "READ" }) => void | Promise<void>;
};

export interface WhatsAppProvider {
  /** Opens a socket for the account, restoring stored credentials if any. */
  connect(accountId: string, events: ProviderEvents, options?: ConnectOptions): Promise<ConnectResult>;

  /**
   * Closes the socket. `logout: true` also tells WhatsApp to unlink the
   * device, which invalidates the stored credentials for good.
   */
  disconnect(accountId: string, options?: { logout?: boolean }): Promise<void>;

  /** Whether this process currently holds a live socket for the account. */
  getStatus(accountId: string): WaStatus;

  sendText(accountId: string, phoneNumber: string, body: string): Promise<SendTextResult>;

  /**
   * Sends a video with `caption` as its text. The caller supplies the bytes
   * (already size-checked); providers must not log them.
   */
  sendVideo(accountId: string, phoneNumber: string, video: SendVideoInput): Promise<SendTextResult>;

  /** Whether a number is reachable on WhatsApp at all. */
  checkNumber(accountId: string, phoneNumber: string): Promise<NumberCheck>;
}
