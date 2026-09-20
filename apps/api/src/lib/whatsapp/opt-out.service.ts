import type { OptOut, PrismaClient } from "@pitchmyweb/db";
import { ValidationError } from "../errors";
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
// The list is therefore readable by every authenticated user, but it only
// ever holds phone numbers and the reason they were added; it is not a
// window into anyone else's leads.

export type PublicOptOut = Pick<OptOut, "phoneNumber" | "source" | "reason" | "createdAt">;

const PUBLIC_FIELDS = { phoneNumber: true, source: true, reason: true, createdAt: true } as const;

export async function listOptOuts(
  db: PrismaClient,
  query: { page: number; pageSize: number },
): Promise<{ items: PublicOptOut[]; page: number; pageSize: number; total: number }> {
  const [items, total] = await Promise.all([
    db.optOut.findMany({
      select: PUBLIC_FIELDS,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.optOut.count(),
  ]);
  return { items, page: query.page, pageSize: query.pageSize, total };
}

/**
 * Adds a number by hand (a business that asked to be removed by phone or
 * email). Idempotent, and never downgrades an existing entry: an
 * INBOUND_KEYWORD row stays as it is, because how the opt-out was obtained
 * is a fact about the past.
 */
export async function addOptOut(db: PrismaClient, input: OptOutCreateInput): Promise<PublicOptOut> {
  const phoneNumber = normalizePhoneForWhatsApp(input.phoneNumber);
  if (!phoneNumber) {
    throw new ValidationError("Enter a valid phone number, including the country code");
  }
  return db.optOut.upsert({
    where: { phoneNumber },
    create: { phoneNumber, source: "MANUAL", reason: input.reason ?? null },
    update: {},
    select: PUBLIC_FIELDS,
  });
}
