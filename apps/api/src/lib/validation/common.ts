import { z } from "zod";

// Zod mirrors of prisma/schema.prisma enums. Keep in sync with the schema —
// Prisma's generated enum objects are runtime values, not zod schemas, so we
// re-declare the literal tuples here rather than depend on zod-version-
// specific enum interop.

export const campaignStatusSchema = z.enum([
  "DRAFT",
  "READY",
  "RUNNING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

export const websiteRequirementSchema = z.enum(["ANY", "WITH_WEBSITE", "WITHOUT_WEBSITE"]);

export const leadStatusSchema = z.enum([
  "NEW",
  "ANALYZED",
  "SITE_READY",
  "PITCHED",
  "REPLIED",
  "INTERESTED",
  "NEGOTIATING",
  "WON",
  "LOST",
]);

export const scoreClassificationSchema = z.enum(["EXCELLENT", "STRONG", "MEDIUM", "LOW", "IGNORE"]);

export const serviceCodeSchema = z.enum([
  "WEBSITE",
  "WEBSITE_REDESIGN",
  "WHATSAPP",
  "REVIEWS",
  "SEO",
  "AI_CHATBOT",
  "AI_VOICE_AGENT",
  "APPOINTMENT_SYSTEM",
  "DIGITAL_MENU",
  "POS",
]);

export const websiteStatusSchema = z.enum(["DRAFT", "GENERATING", "READY", "PUBLISHED", "FAILED"]);

export const pitchStatusSchema = z.enum(["PENDING", "GENERATED", "FAILED"]);

export const outreachChannelSchema = z.enum(["WHATSAPP", "EMAIL", "SMS", "OTHER"]);

export const outreachStatusSchema = z.enum(["PENDING", "LINK_GENERATED", "OPENED", "SENT", "FAILED"]);

export const activityTypeSchema = z.enum([
  "LEAD_CREATED",
  "LEAD_ANALYZED",
  "WEBSITE_GENERATED",
  "DEMO_PUBLISHED",
  "PITCH_GENERATED",
  "WHATSAPP_OPENED",
  "PITCHED",
  "REPLIED",
  "INTERESTED",
  "MEETING",
  "WON",
  "LOST",
]);

export const dealStatusSchema = z.enum(["OPEN", "NEGOTIATING", "WON", "LOST"]);

export const cuidSchema = z.string().min(1, "id is required");

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Shared shape for action endpoints that take no request body at all
// (Phase 7: POST /api/leads/:id/pitch, POST /api/leads/:id/whatsapp) —
// `.strict()` so a client-supplied body with unexpected fields is still
// rejected rather than silently ignored, same as every other endpoint.
export const emptyBodySchema = z.object({}).strict();
