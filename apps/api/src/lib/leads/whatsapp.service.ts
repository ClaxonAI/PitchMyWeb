import type { Outreach, PrismaClient } from "@pitchmyweb/db";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { whatsappDigits } from "./phone";

// POST /api/leads/:id/whatsapp domain service (backend_tasks.md section
// 32, Phase 7 section 13-16). V1 generates a WhatsApp click-to-chat link
// ONLY — this is a plain URL scheme WhatsApp's own client interprets
// (https://wa.me/<number>?text=<message>), not a WhatsApp Business API
// integration; there is no HTTP call to any WhatsApp service, no bulk
// automation, and no automatic sending. The operator manually opens the
// link and sends the message themselves.

const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15; // E.164 maximum

/**
 * Normalizes an operator-typed phone string (as free-text as
 * "+91-9800000001") into the digits-only form wa.me requires, or null if
 * it isn't a plausible phone number at all (section 14: "validate the
 * phone number before generating the action... do not invent a phone
 * number"). Never invents or pads digits — a too-short/too-long/missing
 * value is simply rejected.
 *
 * Still the right check for a number a human just typed — linking an
 * account, recording an opt-out, sending a one-off message — because there
 * is no Business row behind those and so nothing already parsed to read.
 * It is no longer what decides whether a *scraped* business may be
 * pitched: a digit count passes landlines and toll-free numbers just as
 * happily as mobiles. lib/leads/phone.ts owns that question now.
 */
export function normalizePhoneForWhatsApp(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) return null;
  return digits;
}

export type GenerateWhatsAppActionInput = {
  leadId: string;
  userId: string;
  /**
   * The exact message to prefill, when the caller has already composed it
   * from the lead's pitch (the delivery pipeline adds the preview links).
   * Defaults to the latest generated pitch as-is.
   */
  body?: string;
};

export type GenerateWhatsAppActionResult = {
  outreach: Outreach;
  whatsappUrl: string;
};

/**
 * Generates a WhatsApp-ready link from the lead's most recent successfully
 * generated Pitch (section 13: "the message must use only verified lead/
 * business/pitch information") and its business's own phone number.
 * Requires a GENERATED Pitch to already exist — there is no separate
 * "generic templated message assembled from raw facts" fallback, since the
 * Pitch is the only verified outreach text this system produces; if none
 * exists, this is a controlled ConflictError telling the caller to
 * generate a pitch first, not an invented message.
 *
 * Persists a new Outreach row (channel WHATSAPP, status LINK_GENERATED,
 * whatsappUrl set) — deliberately does NOT set openedAt/sentAt and does
 * NOT record a WHATSAPP_OPENED Activity (section 15: this endpoint only
 * prepares the link; the backend cannot reliably observe whether the
 * operator's browser/OS actually opened WhatsApp afterward, so it never
 * claims to). Never transitions the lead's status (section 16) — only the
 * existing PATCH /api/leads/:id lifecycle endpoint may do that.
 */
export async function generateWhatsAppAction(db: PrismaClient, input: GenerateWhatsAppActionInput): Promise<GenerateWhatsAppActionResult> {
  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    include: {
      campaign: { select: { userId: true } },
      business: { select: { normalizedPhone: true, phoneType: true } },
      pitches: { where: { status: "GENERATED" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!lead || lead.campaign.userId !== input.userId) {
    throw new NotFoundError("Lead", input.leadId);
  }

  const latestPitch = lead.pitches[0];
  if (!latestPitch) {
    throw new ConflictError("Generate a pitch for this lead before creating a WhatsApp action");
  }

  // Reads the classification stored at ingest rather than re-deriving it:
  // null here means no valid number, or one of a line type WhatsApp cannot
  // reach, and either way there is nobody to send this to.
  const phoneDigits = whatsappDigits(lead.business);
  if (!phoneDigits) {
    throw new ValidationError("This lead's business has no WhatsApp-reachable phone number on file");
  }

  // Message text is exactly the verified Pitch content, URL-encoded for
  // safe use in a query string — never a secret, never anything beyond
  // what was already validated and persisted for this lead.
  const whatsappUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(input.body ?? latestPitch.content)}`;

  const outreach = await db.outreach.create({
    data: {
      leadId: lead.id,
      pitchId: latestPitch.id,
      channel: "WHATSAPP",
      status: "LINK_GENERATED",
      whatsappUrl,
    },
  });

  return { outreach, whatsappUrl };
}
