import { z } from "zod";
import { WA_STATUSES } from "@pitchmyweb/contracts";
import { paginationQuerySchema } from "./common";

// Zod mirrors of the WhatsApp enums, following the same convention as
// common.ts: the literal tuples are re-declared rather than derived from
// Prisma's generated enum objects. The status list is the one exception —
// it comes from @pitchmyweb/contracts, because the worker and the browser
// both speak it too, and three copies of one list is two too many.

export const waStatusSchema = z.enum(WA_STATUSES);

export const waMessageStatusSchema = z.enum([
  "QUEUED",
  "SENDING",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
  "BLOCKED",
  "CANCELLED",
]);

/**
 * A phone number as a client may send it: free text such as
 * "+91 98000-00001". Normalization to digits happens in the service layer
 * through normalizePhoneForWhatsApp, which is also what decides whether it
 * is a plausible number at all — this only bounds the input size.
 */
export const rawPhoneSchema = z.string().trim().min(6).max(32);

export const accountCreateSchema = z.object({}).strict();

export const pairingCodeRequestSchema = z
  .object({
    phoneNumber: rawPhoneSchema,
  })
  .strict();

// Message bodies are capped well below WhatsApp's own limit. A pitch is a
// few short paragraphs; anything near this ceiling is a bug or an abuse of
// the endpoint, not outreach copy.
export const MAX_MESSAGE_BODY_CHARS = 4_000;

export const messagePreviewSchema = z
  .object({
    accountId: z.string().min(1),
    phoneNumber: rawPhoneSchema,
    // Either supply the text directly, or point at a lead and let the
    // service use that lead's generated pitch.
    body: z.string().trim().min(1).max(MAX_MESSAGE_BODY_CHARS).optional(),
    leadId: z.string().min(1).optional(),
  })
  .strict()
  .refine((input) => input.body !== undefined || input.leadId !== undefined, {
    message: "Provide either a body or a leadId",
    path: ["body"],
  });

export const messageCreateSchema = messagePreviewSchema;

export const messageListQuerySchema = paginationQuerySchema.extend({
  accountId: z.string().min(1).optional(),
  status: waMessageStatusSchema.optional(),
});

export const optOutCreateSchema = z
  .object({
    phoneNumber: rawPhoneSchema,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const optOutListQuerySchema = paginationQuerySchema;

export type PairingCodeRequestInput = z.infer<typeof pairingCodeRequestSchema>;
export type MessagePreviewInput = z.infer<typeof messagePreviewSchema>;
export type MessageCreateInput = z.infer<typeof messageCreateSchema>;
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;
export type OptOutCreateInput = z.infer<typeof optOutCreateSchema>;
