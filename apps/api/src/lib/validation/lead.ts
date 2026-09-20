import { z } from "zod";
import { leadStatusSchema, paginationQuerySchema, serviceCodeSchema } from "./common";

// PATCH /api/leads/:id must never accept status/score/recommendation/deal
// fields directly (Rule 7, section 25) — those are backend-controlled and
// only change through transitionLeadStatus() or the analysis pipeline.
// There is currently no lead field safe for a client to set directly, so
// this schema intentionally has no free-form fields; it exists so future
// route handlers have a single place to add one instead of hand-rolling
// validation inline.
export const leadUpdateSchema = z.object({}).strict();

export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;

// Used by the lifecycle domain service, never applied directly from a
// generic PATCH body.
export const leadStatusTransitionSchema = z.object({
  nextStatus: leadStatusSchema,
});

export type LeadStatusTransitionInput = z.infer<typeof leadStatusTransitionSchema>;

// PATCH /api/leads/:id wire format (section 25's own example body is
// `{"status": "WON"}`). This is the *request body* shape — the route
// handler validates against this, then maps `status` to the domain
// service's `nextStatus` param name when calling transitionLeadStatus().
// `.strict()` so no other field (score, recommendedService, campaignId,
// businessId, ...) can be smuggled through the same PATCH body (Rule 7).
export const leadPatchSchema = z.object({ status: leadStatusSchema }).strict();

export type LeadPatchInput = z.infer<typeof leadPatchSchema>;

// GET /api/leads (backend_tasks.md section 24): campaign, status, score
// range, recommended service, search, pagination.
export const leadListQuerySchema = paginationQuerySchema
  .extend({
    campaignId: z.string().trim().min(1).optional(),
    status: leadStatusSchema.optional(),
    minScore: z.coerce.number().int().min(0).max(100).optional(),
    maxScore: z.coerce.number().int().min(0).max(100).optional(),
    recommendedService: serviceCodeSchema.optional(),
    search: z.string().trim().min(1).optional(),
  })
  .refine((query) => query.minScore === undefined || query.maxScore === undefined || query.minScore <= query.maxScore, {
    message: "minScore must be <= maxScore",
    path: ["minScore"],
  });

export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
