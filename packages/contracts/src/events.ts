import { z } from "zod";

// Realtime events travel worker -> Redis pub/sub -> API -> browser (SSE).
// They are the only thing the browser ever learns about a session, which is
// why there is no event carrying auth material: a QR is a rendered image, a
// pairing code is the six-to-eight character code WhatsApp shows the user,
// and nothing else about the Baileys credential store is exposed.

// Mirrors the WhatsAppStatus enum in packages/db's schema. Kept as a plain
// literal list so this package stays dependency-free of Prisma's generated
// client (the API asserts at compile time that the two agree — see
// apps/api/src/lib/whatsapp/status.ts).
export const WA_STATUSES = [
  "DISCONNECTED",
  "CONNECTING",
  "QR_READY",
  "PAIRING_CODE_READY",
  "CONNECTED",
  "RECONNECTING",
  "LOGGED_OUT",
  "ERROR",
] as const;

export const waStatusSchema = z.enum(WA_STATUSES);
export type WaStatus = z.infer<typeof waStatusSchema>;

const base = { accountId: z.string().min(1), at: z.string() };

export const waEventSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("STATUS"), status: waStatusSchema }),
  z.object({ ...base, type: z.literal("QR_READY"), qrDataUrl: z.string().min(1) }),
  z.object({ ...base, type: z.literal("PAIRING_CODE"), code: z.string().min(1) }),
  z.object({ ...base, type: z.literal("CONNECTED"), phoneNumber: z.string().min(1) }),
  z.object({ ...base, type: z.literal("LOGGED_OUT") }),
  // Always a sanitized, user-facing string — never a raw Baileys/stack message.
  z.object({ ...base, type: z.literal("ERROR"), message: z.string().min(1) }),
]);

export type WaEvent = z.infer<typeof waEventSchema>;
export type WaEventType = WaEvent["type"];

/** Parses a raw pub/sub payload, returning null instead of throwing on junk. */
export function parseWaEvent(raw: string): WaEvent | null {
  try {
    const result = waEventSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const discoveryBase = { executionId: z.string().min(1), at: z.string() };

export const discoveryEventSchema = z.discriminatedUnion("stage", [
  z.object({ ...discoveryBase, stage: z.literal("QUEUED") }),
  z.object({ ...discoveryBase, stage: z.literal("GEOCODING") }),
  z.object({ ...discoveryBase, stage: z.literal("SEARCHING") }),
  z.object({
    ...discoveryBase,
    stage: z.literal("ENRICHING"),
    completed: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
  z.object({ ...discoveryBase, stage: z.literal("COMPLETED"), found: z.number().int().min(0) }),
  z.object({ ...discoveryBase, stage: z.literal("FAILED"), message: z.string().min(1) }),
]);

export type DiscoveryEvent = z.infer<typeof discoveryEventSchema>;
export type DiscoveryStage = DiscoveryEvent["stage"];

/** Parses a raw pub/sub payload, returning null instead of throwing on junk. */
export function parseDiscoveryEvent(raw: string): DiscoveryEvent | null {
  try {
    const result = discoveryEventSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
