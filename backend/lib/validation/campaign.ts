import { z } from "zod";
import { paginationQuerySchema, websiteRequirementSchema } from "./common";

// Shared field shapes with NO defaults applied — the base that both the
// create and update schemas derive from. Keeping defaults out of this base
// is what makes campaignUpdateSchema's `.partial()` below produce true
// omission instead of Zod re-inserting a default for a field the client
// never mentioned (Phase 4 code-review finding #1: campaignCreateSchema's
// old `websiteRequirement.default("ANY")` bled through `.partial()`, so a
// PATCH that only touched e.g. leadLimit silently reset websiteRequirement
// back to "ANY". Verified empirically: `campaignCreateSchema.partial()`
// keeps re-applying a default defined on the base object, only a field
// defined without a default on the *update* schema's own base is genuinely
// optional-without-default.).
const campaignFieldsSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  location: z.string().trim().min(1, "location is required"),
  radius: z.number().positive("radius must be positive").optional(),
  category: z.string().trim().min(1, "category is required"),
  minRating: z.number().min(0).max(5).optional(),
  minReviews: z.number().int().min(0).optional(),
  websiteRequirement: websiteRequirementSchema,
  leadLimit: z.number().int().positive("leadLimit must be greater than 0"),
});

// backend_tasks.md section 5.2. Status is intentionally excluded from the
// create schema: the backend controls campaign status transitions, clients
// never set it directly on creation (Rule 7) — createCampaign always starts
// a campaign at DRAFT. The default lives ONLY here, on the create schema —
// creating a campaign without specifying websiteRequirement legitimately
// means "ANY"; that default must never leak into the update schema below.
export const campaignCreateSchema = campaignFieldsSchema.extend({
  websiteRequirement: websiteRequirementSchema.default("ANY"),
});

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;

// PATCH /api/campaigns/:id (section 7): editable fields are the same set as
// creation, all optional — derived from campaignFieldsSchema (no defaults),
// not from campaignCreateSchema, so omitting a field on PATCH means "leave
// it unchanged," never "reset it to the create-time default." `status` is a
// narrow, deliberate exception to "clients never set status directly"
// (Rule 7) — READY is the one status a user legitimately triggers
// themselves (the doc's endpoint list has no dedicated "mark ready" route),
// and the route handler never applies it as a raw field write: it calls
// markCampaignReady() (campaign.service.ts), which re-validates the
// transition through the same state graph used everywhere else. No other
// status value is accepted here — RUNNING is only reachable through
// POST /:id/run, and PROCESSING/COMPLETED/FAILED are execution-controlled
// only.
export const campaignUpdateSchema = campaignFieldsSchema.partial().extend({
  status: z.literal("READY").optional(),
});

export type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>;

// POST /api/campaigns/:id/run (future route). Idempotency key lets a retried
// request be recognized as the same execution request rather than starting
// a second run (backend_tasks.md section 37).
export const campaignRunRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(1).optional(),
});

export type CampaignRunRequest = z.infer<typeof campaignRunRequestSchema>;

export const campaignListQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(["DRAFT", "READY", "RUNNING", "PROCESSING", "COMPLETED", "FAILED"])
    .optional(),
});

export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;
