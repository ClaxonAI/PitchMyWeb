import { z } from "zod";

export const parseCampaignQueryRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
  })
  .strict();
