import { z } from "zod";

// Request contracts for the delivery pipeline endpoints.

export const campaignLeadsQuerySchema = z.object({
  sort: z.enum(["score", "recent"]).default("score"),
  search: z.string().trim().min(1).max(100).optional(),
});

export type CampaignLeadsQueryInput = z.infer<typeof campaignLeadsQuerySchema>;

/**
 * Either an explicit list of leads, or `{ auto: true }` for every eligible
 * lead up to targetCount (omitted `count`) — or up to `count` specifically
 * (the "how many do you want to pitch?" flow). Either way, selection.service
 * .ts never reserves or creates more than the wallet can actually cover;
 * `count` is a ceiling the caller is asking for, not a guarantee.
 */
export const campaignSelectionSchema = z.union([
  z.object({ leadIds: z.array(z.string().min(1)).min(1).max(200) }).strict(),
  z.object({ auto: z.literal(true), count: z.number().int().positive().max(200).optional() }).strict(),
]);

export type CampaignSelectionInput = z.infer<typeof campaignSelectionSchema>;

export const recordingReadySchema = z
  .object({
    recordingId: z.string().min(1),
  })
  .strict();

export const slugParamSchema = z.string().trim().min(3).max(80);
