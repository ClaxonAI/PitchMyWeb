import { z } from "zod";

// Request contracts for the delivery pipeline endpoints.

export const campaignLeadsQuerySchema = z.object({
  sort: z.enum(["score", "recent"]).default("score"),
  search: z.string().trim().min(1).max(100).optional(),
});

export type CampaignLeadsQueryInput = z.infer<typeof campaignLeadsQuerySchema>;

/** Either an explicit list of leads, or `{ auto: true }` for top-N by score. */
export const campaignSelectionSchema = z.union([
  z.object({ leadIds: z.array(z.string().min(1)).min(1).max(200) }).strict(),
  z.object({ auto: z.literal(true) }).strict(),
]);

export type CampaignSelectionInput = z.infer<typeof campaignSelectionSchema>;

export const recordingReadySchema = z
  .object({
    recordingId: z.string().min(1),
  })
  .strict();

export const slugParamSchema = z.string().trim().min(3).max(80);
