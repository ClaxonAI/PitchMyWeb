import type { PrismaClient } from "@pitchmyweb/db";
import { logger } from "../logger.js";

// Everything that arrives *from* WhatsApp: replies that mean "stop", and
// delivery/read receipts for messages we sent.

// Deliberately a small, explicit list rather than a fuzzy matcher. The cost
// asymmetry runs one way: a false positive loses one lead, a false negative
// means messaging a business that already told us to stop. So matching is
// generous — a short reply containing one of these words counts — while a
// long message that merely mentions the word in passing does not.
const STOP_KEYWORDS = [
  "STOP",
  "UNSUBSCRIBE",
  "OPT OUT",
  "OPTOUT",
  "REMOVE ME",
  "DO NOT CONTACT",
  "DONT CONTACT",
  "LEAVE ME ALONE",
  "NO THANKS",
];

/** Length past which a message is prose, not a one-word refusal. */
const SHORT_REPLY_CHARS = 60;

/**
 * Returns the keyword that matched, or null. Exported for its own test: the
 * matching rule is the whole safety property, so it is kept pure and free of
 * database access.
 */
export function matchStopKeyword(text: string): string | null {
  const normalized = text
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length === 0) return null;

  for (const keyword of STOP_KEYWORDS) {
    if (normalized === keyword) return keyword;
  }
  if (normalized.length > SHORT_REPLY_CHARS) return null;
  for (const keyword of STOP_KEYWORDS) {
    // Whole-word containment, so "STOP" matches "please stop" but not
    // "stopwatch".
    const pattern = new RegExp(`(^| )${keyword}( |$)`);
    if (pattern.test(normalized)) return keyword;
  }
  return null;
}

export class InboundHandler {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Records a global opt-out when an inbound reply asks to stop. Idempotent:
   * a business that sends STOP three times produces one row, and an
   * existing MANUAL entry is never downgraded or overwritten.
   */
  async handleIncomingText(phoneNumber: string, text: string): Promise<void> {
    const keyword = matchStopKeyword(text);
    if (!keyword) return;
    if (!/^\d{8,15}$/.test(phoneNumber)) return;

    await this.db.optOut.upsert({
      where: { phoneNumber },
      create: { phoneNumber, source: "INBOUND_KEYWORD", reason: `Replied "${keyword}"` },
      update: {},
    });
    // The number itself is business contact data, so it is logged only at
    // debug level and never alongside the message text.
    logger.info({ keyword }, "recorded inbound opt-out");
  }

  /**
   * Applies a delivery or read receipt. Status only ever moves forward:
   * WhatsApp can deliver a DELIVERED receipt after a READ one (a second
   * device acknowledging late), and that must not walk the row backwards.
   */
  async handleReceipt(providerMessageId: string, status: "DELIVERED" | "READ"): Promise<void> {
    const now = new Date();
    if (status === "DELIVERED") {
      await this.db.whatsAppMessage.updateMany({
        where: { providerMessageId, status: { in: ["SENDING", "SENT"] } },
        data: { status: "DELIVERED", deliveredAt: now },
      });
      return;
    }
    await this.db.whatsAppMessage.updateMany({
      where: { providerMessageId, status: { in: ["SENDING", "SENT", "DELIVERED"] } },
      data: { status: "READ", readAt: now },
    });
    // A message read without a delivery receipt ever arriving was still
    // delivered. Backfilling keeps the timeline coherent, as a separate
    // write so it can never overwrite a real deliveredAt with a later one.
    await this.db.whatsAppMessage.updateMany({
      where: { providerMessageId, deliveredAt: null },
      data: { deliveredAt: now },
    });
  }
}
