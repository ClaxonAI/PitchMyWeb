import { z } from "zod";
import { paginationQuerySchema } from "./common";

export const possibleDuplicateStatusSchema = z.enum(["PENDING", "CONFIRMED_MERGED", "DISMISSED"]);

export const possibleDuplicateListQuerySchema = paginationQuerySchema.extend({
  status: possibleDuplicateStatusSchema.optional(),
});

export type PossibleDuplicateListQuery = z.infer<typeof possibleDuplicateListQuerySchema>;

// POST /api/possible-duplicates/:id/merge — no body required; `reason` is
// an optional free-text note for the audit trail (BusinessMerge.reason).
export const mergePossibleDuplicateSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type MergePossibleDuplicateInput = z.infer<typeof mergePossibleDuplicateSchema>;
