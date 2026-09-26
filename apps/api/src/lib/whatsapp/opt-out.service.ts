import type { OptOut, PrismaClient } from "@pitchmyweb/db";
import { ForbiddenError, ValidationError } from "../errors";
import { normalizePhoneForWhatsApp } from "../leads/whatsapp.service";
import type { OptOutCreateInput } from "../validation/whatsapp";

// The do-not-contact list.
//
// It is global, not per-user: once a business has said stop, no PitchMyWeb
// account may message it. That is a deliberate product decision rather than
// a modelling shortcut — a per-user list would let the same business be
// re-pitched by the next user who discovers it, which is exactly the
// behaviour that gets a number banned and the sender reported.
//
// Enforcement is global; visibility is not. Every customer's pitches are
// checked against the whole list, but a user only ever *sees* the entries
// that concern them (numbers they added, or numbers they have messaged), and
// may only add numbers from their own leads or messages. Showing everyone
// the full list leaked other customers' contacts, and letting anyone add any
// number let one customer block another's outreach. Admins see it all.

export type PublicOptOut = Pick<OptOut, "phoneNumber" | "source" | "reason" | "createdAt">;

const PUBLIC_FIELDS = { phoneNumber: true, source: true, reason: true, createdAt: true } as const;

type Viewer = { id: string; isAdmin: boolean };

/** Numbers this user has messaged (bounded), for scoping what they see. */
async function numbersMessagedBy(db: PrismaClient, userId: string): Promise<string[]> {
  const rows = await db.whatsAppMessage.findMany({ where: { userId }, select: { phoneNumber: true }, distinct: ["phoneNumber"], take: 10_000 });
  return rows.map((row) => row.phoneNumber);
}

export async function listOptOuts(
  db: PrismaClient,
  viewer: Viewer,
  query: { page: number; pageSize: number },
): Promise<{ items: PublicOptOut[]; page: number; pageSize: number; total: number }> {
  const where = viewer.isAdmin
    ? {}
    : { OR: [{ createdByUserId: viewer.id }, { phoneNumber: { in: await numbersMessagedBy(db, viewer.id) } }] };
  const [items, total] = await Promise.all([
    db.optOut.findMany({
      where,
      select: PUBLIC_FIELDS,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.optOut.count({ where }),
  ]);
  return { items, page: query.page, pageSize: query.pageSize, total };
}

/** Whether `phoneNumber` (digits) belongs to one of this user's leads, or was messaged by them. */
async function isUsersContact(db: PrismaClient, userId: string, phoneNumber: string): Promise<boolean> {
  const [lead, message] = await Promise.all([
    db.lead.findFirst({ where: { campaign: { userId }, business: { normalizedPhone: `+${phoneNumber}` } }, select: { id: true } }),
    db.whatsAppMessage.findFirst({ where: { userId, phoneNumber }, select: { id: true } }),
  ]);
  return Boolean(lead ?? message);
}

/**
 * Adds a number by hand (a business that asked to be removed by phone or
 * email). Idempotent, and never downgrades an existing entry: an
 * INBOUND_KEYWORD row stays as it is, because how the opt-out was obtained
 * is a fact about the past.
 */
export async function addOptOut(db: PrismaClient, viewer: Viewer, input: OptOutCreateInput): Promise<PublicOptOut> {
  const phoneNumber = normalizePhoneForWhatsApp(input.phoneNumber);
  if (!phoneNumber) {
    throw new ValidationError("Enter a valid phone number, including the country code");
  }
  if (!viewer.isAdmin && !(await isUsersContact(db, viewer.id, phoneNumber))) {
    throw new ForbiddenError("You can only opt out numbers from your own leads or messages.");
  }
  return db.optOut.upsert({
    where: { phoneNumber },
    create: { phoneNumber, source: "MANUAL", reason: input.reason ?? null, createdByUserId: viewer.id },
    update: {},
    select: PUBLIC_FIELDS,
  });
}
