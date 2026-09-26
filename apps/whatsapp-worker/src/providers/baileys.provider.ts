import makeWASocket, { Browsers, fetchLatestBaileysVersion, jidNormalizedUser } from "baileys";
import type { WASocket } from "baileys";
import { WHATSAPP_PAIRING_TTL_SECONDS } from "@pitchmyweb/contracts";
import type { WaStatus } from "@pitchmyweb/contracts";
import { baileysLogger, logger, sanitizeError } from "../logger.js";
import { usePostgresAuthState } from "../session/auth-state.js";
import type { AuthStateRepository } from "../session/auth-state.repository.js";
import { classifyDisconnect } from "../session/disconnect-reason.js";
import type { ConnectOptions, ConnectResult, NumberCheck, ProviderEvents, SendTextResult, SendVideoInput, WhatsAppProvider } from "./whatsapp.provider.js";

// The only file in the monorepo that imports `baileys`.
//
// Its job is narrow on purpose: translate the library event stream into the
// provider callbacks, and translate our three outbound operations into
// socket calls. No database writes, no Redis, no policy — those belong to
// the session manager and the workers, which is what makes the rest of the
// layer testable without a WhatsApp connection.

type LiveSocket = {
  socket: WASocket;
  status: WaStatus;
  events: ProviderEvents;
  /** Set while we are tearing the socket down deliberately. */
  closing: boolean;
  /** Closes an unfinished pairing attempt once its code has expired. */
  pairingTimer?: ReturnType<typeof setTimeout>;
};

const MAX_QR_EMISSIONS = 1;
let latestVersionPromise: ReturnType<typeof fetchLatestBaileysVersion> | null = null;

function latestBaileysVersion(): ReturnType<typeof fetchLatestBaileysVersion> {
  latestVersionPromise ??= fetchLatestBaileysVersion().catch((error) => {
    latestVersionPromise = null;
    throw error;
  });
  return latestVersionPromise;
}

export class BaileysProvider implements WhatsAppProvider {
  private readonly sockets = new Map<string, LiveSocket>();

  constructor(private readonly authRepo: AuthStateRepository) {}

  getStatus(accountId: string): WaStatus {
    return this.sockets.get(accountId)?.status ?? "DISCONNECTED";
  }

  /** The live socket, or a thrown error when this process has none. */
  private require(accountId: string): LiveSocket {
    const live = this.sockets.get(accountId);
    if (!live) {
      throw new Error(`No live WhatsApp socket for account ${accountId} in this worker`);
    }
    return live;
  }

  async connect(accountId: string, events: ProviderEvents, options: ConnectOptions = {}): Promise<ConnectResult> {
    // Opening a second socket on top of an existing one would leave two
    // clients sharing one credential store — the exact thing the session
    // lock exists to prevent, so it is refused here too.
    if (this.sockets.has(accountId)) {
      await this.disconnect(accountId);
    }

    const { state, saveCreds, isFresh } = await usePostgresAuthState(this.authRepo, accountId);
    const { version } = await latestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      logger: baileysLogger(accountId),
      // Identifies the linked device in the WhatsApp "Linked devices"
      // list. Being honest about what it is matters: the user should
      // recognize it when deciding whether to unlink.
      browser: Browsers.appropriate("PitchMyWeb"),
      // This is an outreach client, not a chat app. Pulling an entire
      // message history would be a large, slow privacy liability for data
      // the product never reads.
      syncFullHistory: false,
      // Staying offline leaves notifications going to the phone as normal
      // instead of silently swallowing them here.
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    });

    const live: LiveSocket = { socket, status: "CONNECTING", events, closing: false };
    this.sockets.set(accountId, live);

    let qrCount = 0;
    // Pairing mode ("link with phone number"): the code must be requested
    // on a socket that has finished its handshake and is waiting to register
    // a new device. The first QR event is exactly that moment. Asking any
    // earlier (as this used to, straight after makeWASocket) makes Baileys
    // write the number into the stored credentials before the socket opens;
    // the handshake then attempts a *login* with half-made credentials,
    // WhatsApp answers 401, and the account ends up LOGGED OUT with no code.
    const pairingPhone = options.pairingPhone;
    let pairingRequested = false;

    socket.ev.on("creds.update", () => {
      void saveCreds().catch((error) => {
        logger.error({ accountId, err: sanitizeError(error) }, "failed to persist WhatsApp credentials");
      });
    });

    socket.ev.on("connection.update", (update) => {
      void (async () => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && pairingPhone) {
          // No QR is shown in pairing mode: the user is typing a code, and a
          // QR event would replace it on screen. Later QR rotations are
          // ignored; the code stays valid until the pairing timer below.
          if (pairingRequested || state.creds.registered) return;
          pairingRequested = true;
          try {
            const code = await socket.requestPairingCode(pairingPhone);
            live.status = "PAIRING_CODE_READY";
            await events.onPairingCode(code);
            await events.onStatus("PAIRING_CODE_READY");
            live.pairingTimer = setTimeout(() => {
              void this.failExpired(accountId, "The code expired before it was entered in WhatsApp. Get a new code.");
            }, WHATSAPP_PAIRING_TTL_SECONDS * 1000);
          } catch (error) {
            await this.failExpired(accountId, sanitizeError(error, "WhatsApp did not return a pairing code. Check the number and try again."));
          }
          return;
        }

        if (qr) {
          qrCount += 1;
          // Baileys re-emits a fresh QR roughly every minute, forever. One
          // is enough: the UI shows it, and a user who lets it expire asks
          // for a new one explicitly. Unbounded, an abandoned link attempt
          // would hold a socket open indefinitely.
          if (qrCount > MAX_QR_EMISSIONS) {
            await this.failExpired(accountId);
            return;
          }
          live.status = "QR_READY";
          await events.onQr(qr);
          await events.onStatus("QR_READY");
        }

        if (connection === "open") {
          clearTimeout(live.pairingTimer);
          live.status = "CONNECTED";
          const me = socket.user;
          const phoneNumber = me?.id ? (jidNormalizedUser(me.id).split("@")[0]?.split(":")[0] ?? "") : "";
          await events.onConnected({ phoneNumber, displayName: me?.name ?? undefined });
          await events.onStatus("CONNECTED");
        }

        if (connection === "close") {
          clearTimeout(live.pairingTimer);
          const outcome = classifyDisconnect(lastDisconnect?.error);
          this.sockets.delete(accountId);
          live.status = "DISCONNECTED";
          // A deliberate disconnect already told the manager what it
          // meant; reporting it again would schedule a reconnect for a
          // session the user just asked us to close.
          if (live.closing) return;
          // A pairing socket that closes before the phone linked has nothing
          // to reconnect to: its code died with it, and a reconnect would
          // come back in QR mode the user never asked for. Once the phone
          // has linked, WhatsApp closes the socket on purpose ("restart
          // required") and the normal reconnect below finishes the login.
          if (pairingPhone && !state.creds.registered) {
            await events.onStatus("ERROR", { error: "The code expired before it was entered in WhatsApp. Get a new code." });
            return;
          }
          if (outcome.action === "logged_out") {
            await events.onLoggedOut(outcome.reason);
          }
          await events.onClosed(outcome);
        }
      })().catch((error) => {
        logger.error({ accountId, err: sanitizeError(error) }, "connection.update handler failed");
      });
    });

    socket.ev.on("messages.upsert", ({ messages, type }) => {
      // "notify" is a live incoming message; "append" is history backfill,
      // which must never be read as someone replying STOP right now.
      if (type !== "notify") return;
      void (async () => {
        for (const message of messages) {
          if (message.key.fromMe) continue;
          const remoteJid = message.key.remoteJid;
          // Groups, broadcasts and status updates are not outreach replies
          // and must not drive opt-outs.
          if (!remoteJid || !remoteJid.endsWith("@s.whatsapp.net")) continue;
          const text =
            message.message?.conversation ??
            message.message?.extendedTextMessage?.text ??
            message.message?.imageMessage?.caption ??
            message.message?.videoMessage?.caption ??
            "";
          if (!text) continue;
          await events.onIncomingText({
            from: jidNormalizedUser(remoteJid).split("@")[0] ?? "",
            text,
            providerMessageId: message.key.id ?? undefined,
          });
        }
      })().catch((error) => {
        logger.error({ accountId, err: sanitizeError(error) }, "messages.upsert handler failed");
      });
    });

    socket.ev.on("messages.update", (updates) => {
      void (async () => {
        for (const { key, update } of updates) {
          const id = key.id;
          if (!id || !key.fromMe) continue;
          // WebMessageInfo.Status: 3 = DELIVERY_ACK, 4 = READ, 5 = PLAYED.
          const status = update.status;
          if (status === 4 || status === 5) {
            await events.onReceipt({ providerMessageId: id, status: "READ" });
          } else if (status === 3) {
            await events.onReceipt({ providerMessageId: id, status: "DELIVERED" });
          }
        }
      })().catch((error) => {
        logger.error({ accountId, err: sanitizeError(error) }, "messages.update handler failed");
      });
    });

    await events.onStatus("CONNECTING");
    return { restored: !isFresh };
  }

  /** Closes a link attempt whose QR was never scanned, or whose pairing code was never entered. */
  private async failExpired(accountId: string, message = "The QR code expired before it was scanned"): Promise<void> {
    const live = this.sockets.get(accountId);
    if (!live) return;
    clearTimeout(live.pairingTimer);
    live.closing = true;
    await this.closeSocket(live);
    this.sockets.delete(accountId);
    await live.events.onStatus("ERROR", { error: message });
  }

  async disconnect(accountId: string, options: { logout?: boolean } = {}): Promise<void> {
    const live = this.sockets.get(accountId);
    if (!live) return;
    clearTimeout(live.pairingTimer);
    live.closing = true;
    if (options.logout) {
      try {
        // Tells WhatsApp to unlink the device, so it disappears from the
        // "Linked devices" list rather than lingering as a dead entry the
        // user has to clean up by hand.
        await live.socket.logout();
      } catch (error) {
        logger.warn({ accountId, err: sanitizeError(error) }, "logout call failed; closing socket anyway");
      }
    }
    await this.closeSocket(live);
    this.sockets.delete(accountId);
  }

  private async closeSocket(live: LiveSocket): Promise<void> {
    try {
      await live.socket.end(undefined);
    } catch {
      // `end` throws when the socket is already gone, which is the state
      // we were asking for anyway.
    }
  }

  async sendText(accountId: string, phoneNumber: string, body: string): Promise<SendTextResult> {
    const live = this.require(accountId);
    if (live.status !== "CONNECTED") {
      throw new Error("The WhatsApp socket is not connected");
    }
    const sent = await live.socket.sendMessage(`${phoneNumber}@s.whatsapp.net`, { text: body });
    const providerMessageId = sent?.key?.id;
    if (!providerMessageId) {
      throw new Error("WhatsApp accepted the message but returned no message id");
    }
    return { providerMessageId };
  }

  async sendVideo(accountId: string, phoneNumber: string, video: SendVideoInput): Promise<SendTextResult> {
    const live = this.require(accountId);
    if (live.status !== "CONNECTED") {
      throw new Error("The WhatsApp socket is not connected");
    }
    // Baileys uploads the buffer to WhatsApp's media servers, then sends the
    // message referencing it. The bytes are never logged.
    const sent = await live.socket.sendMessage(`${phoneNumber}@s.whatsapp.net`, {
      video: video.data,
      mimetype: video.mimetype,
      caption: video.caption,
    });
    const providerMessageId = sent?.key?.id;
    if (!providerMessageId) {
      throw new Error("WhatsApp accepted the video but returned no message id");
    }
    return { providerMessageId };
  }

  async checkNumber(accountId: string, phoneNumber: string): Promise<NumberCheck> {
    const live = this.require(accountId);
    const results = await live.socket.onWhatsApp(phoneNumber);
    const match = results?.[0];
    if (!match?.exists) return { exists: false };
    return { exists: true, jid: match.jid };
  }

  /** Every account this process currently holds a socket for. */
  liveAccountIds(): string[] {
    return [...this.sockets.keys()];
  }
}
