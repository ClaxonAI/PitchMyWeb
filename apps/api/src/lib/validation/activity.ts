import { z } from "zod";
import { paginationQuerySchema } from "./common";

// GET /api/activities (Phase 1 dashboard Activity feed): optional
// campaignId/leadId narrow the feed to one campaign/lead, both scoped
// server-side to the caller's own campaigns regardless of what's passed.
export const activityListQuerySchema = paginationQuerySchema.extend({
  campaignId: z.string().trim().min(1).optional(),
  leadId: z.string().trim().min(1).optional(),
});

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
