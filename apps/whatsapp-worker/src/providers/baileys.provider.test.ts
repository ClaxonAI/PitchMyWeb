import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderEvents } from "./whatsapp.provider.js";

// Replays the order in which a Baileys socket reports events, to pin down
// when the pairing code is requested. Asking before the socket is ready to
// register a device is what made "link with phone number" log the account
// out without ever showing a code.

type Handler = (payload: unknown) => void;

const creds = { registered: false };
const socket = {
  handlers: new Map<string, Handler[]>(),
  ev: {
    on(event: string, handler: Handler) {
      const list = socket.handlers.get(event) ?? [];
      list.push(handler);
      socket.handlers.set(event, list);
    },
  },
  requestPairingCode: vi.fn(async (_phone: string) => "ABCD1234"),
  end: vi.fn(async () => undefined),
  user: undefined as { id: string; name?: string } | undefined,
};

vi.mock("baileys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("baileys")>()),
  default: vi.fn(() => socket),
  Browsers: { appropriate: (name: string) => ["Ubuntu", name, "6.1"], ubuntu: (name: string) => ["Ubuntu", name, "22.04.4"] },
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }),
  jidNormalizedUser: (jid: string) => jid,
}));

vi.mock("../session/auth-state.js", () => ({
  usePostgresAuthState: async () => ({ state: { creds, keys: {} }, saveCreds: async () => undefined, isFresh: true }),
}));

const { BaileysProvider, browserFor } = await import("./baileys.provider.js");
const makeWASocket = (await import("baileys")).default as unknown as ReturnType<typeof vi.fn>;
const realBaileys = await vi.importActual<typeof import("baileys")>("baileys");

function recordingEvents() {
  const calls = {
    status: [] as Array<{ status: string; error?: string }>,
    qr: [] as string[],
    codes: [] as string[],
  };
  const events: ProviderEvents = {
    onStatus: (status, detail) => void calls.status.push({ status, error: detail?.error }),
    onQr: (qr) => void calls.qr.push(qr),
    onPairingCode: (code) => void calls.codes.push(code),
    onConnected: () => undefined,
    onLoggedOut: () => undefined,
    onClosed: () => undefined,
    onIncomingText: () => undefined,
    onReceipt: () => undefined,
  };
  return { events, calls };
}

async function emit(update: Record<string, unknown>) {
  for (const handler of socket.handlers.get("connection.update") ?? []) handler(update);
  // The handler runs its body as a detached promise.
  await vi.waitFor(() => undefined);
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  socket.handlers.clear();
  socket.requestPairingCode.mockClear();
  socket.requestPairingCode.mockImplementation(async () => "ABCD1234");
  socket.end.mockClear();
  makeWASocket.mockClear();
  creds.registered = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BaileysProvider pairing mode", () => {
  it("asks for the code only once the socket is ready to register, and shows no QR", async () => {
    const provider = new BaileysProvider({} as never);
    const { events, calls } = recordingEvents();
    await provider.connect("acc1", events, { pairingPhone: "919488329318" });

    expect(socket.requestPairingCode).not.toHaveBeenCalled();
    await emit({ connection: "connecting" });
    expect(socket.requestPairingCode).not.toHaveBeenCalled();

    await emit({ qr: "qr-1" });
    expect(socket.requestPairingCode).toHaveBeenCalledTimes(1);
    expect(socket.requestPairingCode).toHaveBeenCalledWith("919488329318");
    expect(calls.codes).toEqual(["ABCD1234"]);
    expect(calls.status.map((s) => s.status)).toContain("PAIRING_CODE_READY");
    expect(calls.qr).toEqual([]);

    // WhatsApp keeps rotating the QR; none of it may replace the code or
    // close the attempt the way an unscanned QR does.
    await emit({ qr: "qr-2" });
    await emit({ qr: "qr-3" });
    expect(socket.requestPairingCode).toHaveBeenCalledTimes(1);
    expect(calls.qr).toEqual([]);
    expect(calls.status.map((s) => s.status)).not.toContain("ERROR");
    expect(provider.getStatus("acc1")).toBe("PAIRING_CODE_READY");
  });

  it("never asks on credentials that are already registered", async () => {
    creds.registered = true;
    const provider = new BaileysProvider({} as never);
    const { events, calls } = recordingEvents();
    await provider.connect("acc2", events, { pairingPhone: "919488329318" });
    await emit({ qr: "qr-1" });
    expect(socket.requestPairingCode).not.toHaveBeenCalled();
    expect(calls.codes).toEqual([]);
  });

  it("reports a refused request as an error instead of going quiet", async () => {
    socket.requestPairingCode.mockRejectedValueOnce(new Error("bad-request"));
    const provider = new BaileysProvider({} as never);
    const { events, calls } = recordingEvents();
    await provider.connect("acc3", events, { pairingPhone: "919488329318" });
    await emit({ qr: "qr-1" });
    expect(calls.codes).toEqual([]);
    expect(calls.status.at(-1)?.status).toBe("ERROR");
    expect(socket.end).toHaveBeenCalled();
  });

  it("closes the attempt when the code expires unused", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const provider = new BaileysProvider({} as never);
    const { events, calls } = recordingEvents();
    await provider.connect("acc4", events, { pairingPhone: "919488329318" });
    await emit({ qr: "qr-1" });
    expect(calls.codes).toEqual(["ABCD1234"]);

    await vi.advanceTimersByTimeAsync(150_000);
    expect(calls.status.at(-1)).toEqual({ status: "ERROR", error: expect.stringMatching(/expired/) });
    expect(socket.end).toHaveBeenCalled();
  });

  it("a socket that closes before the phone linked ends the attempt instead of reconnecting in QR mode", async () => {
    const provider = new BaileysProvider({} as never);
    const closed: unknown[] = [];
    const { events, calls } = recordingEvents();
    events.onClosed = (outcome) => void closed.push(outcome);
    await provider.connect("acc7", events, { pairingPhone: "919488329318" });
    await emit({ qr: "qr-1" });
    await emit({ connection: "close", lastDisconnect: { error: Object.assign(new Error("QR refs attempts ended"), { output: { statusCode: 408 } }) } });
    expect(closed).toEqual([]);
    expect(calls.status.at(-1)).toEqual({ status: "ERROR", error: expect.stringMatching(/expired/) });
  });

  it("after the phone links, WhatsApp's restart request still reconnects", async () => {
    const provider = new BaileysProvider({} as never);
    const closed: Array<{ action: string }> = [];
    const { events } = recordingEvents();
    events.onClosed = (outcome) => void closed.push(outcome);
    await provider.connect("acc8", events, { pairingPhone: "919488329318" });
    await emit({ qr: "qr-1" });
    creds.registered = true;
    await emit({ connection: "close", lastDisconnect: { error: Object.assign(new Error("restart required"), { output: { statusCode: 515 } }) } });
    expect(closed.map((c) => c.action)).toEqual(["reconnect"]);
  });

  it("a linked phone clears the expiry timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const provider = new BaileysProvider({} as never);
    const { events, calls } = recordingEvents();
    await provider.connect("acc5", events, { pairingPhone: "919488329318" });
    await emit({ qr: "qr-1" });
    socket.user = { id: "919488329318:1@s.whatsapp.net" };
    await emit({ connection: "open" });
    await vi.advanceTimersByTimeAsync(150_000);
    expect(calls.status.map((s) => s.status)).not.toContain("ERROR");
    socket.user = undefined;
  });
});

describe("browser identity", () => {
  // The phone turns the browser name into a platform id when a device links
  // by code. An unknown name made it answer "Couldn't link device".
  it("links by phone number as Chrome, a platform the phone accepts", () => {
    expect(realBaileys.getCompanionPlatformId(realBaileys.Browsers.ubuntu("Chrome"))).toBe("1");
    expect(realBaileys.getCompanionPlatformId(realBaileys.Browsers.appropriate("PitchMyWeb"))).not.toBe("1");
  });

  it("uses Chrome for a pairing socket and keeps the PitchMyWeb name for QR", async () => {
    expect(browserFor("pairing")).toEqual(["Ubuntu", "Chrome", "22.04.4"]);
    expect(browserFor("qr")).toEqual(["Ubuntu", "PitchMyWeb", "6.1"]);

    const provider = new BaileysProvider({} as never);
    await provider.connect("acc-pair", recordingEvents().events, { pairingPhone: "919488329318" });
    expect(makeWASocket.mock.calls.at(-1)?.[0]).toMatchObject({ browser: ["Ubuntu", "Chrome", "22.04.4"] });

    await provider.connect("acc-qr", recordingEvents().events);
    expect(makeWASocket.mock.calls.at(-1)?.[0]).toMatchObject({ browser: ["Ubuntu", "PitchMyWeb", "6.1"] });
  });
});

describe("BaileysProvider QR mode", () => {
  it("shows the first QR and closes the attempt on the next", async () => {
    const provider = new BaileysProvider({} as never);
    const { events, calls } = recordingEvents();
    await provider.connect("acc6", events);
    await emit({ qr: "qr-1" });
    expect(calls.qr).toEqual(["qr-1"]);
    expect(socket.requestPairingCode).not.toHaveBeenCalled();
    await emit({ qr: "qr-2" });
    expect(calls.status.at(-1)).toEqual({ status: "ERROR", error: "The QR code expired before it was scanned" });
  });
});
