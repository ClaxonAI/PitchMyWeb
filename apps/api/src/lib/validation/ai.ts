import { z } from "zod";
import { serviceCodeSchema } from "./common";

// Model structured-output contract (backend_tasks.md section 27). Used by
// lib/ai/lead-analysis.service.ts (Phase 5) to validate every raw model
// response before anything downstream trusts it (Rule 6: AI output is
// untrusted until parsed + validated).
//
// `.strict()` (Phase 5 section 8: "strict/unexpected fields according to
// the existing project conventions" — matching leadPatchSchema's own
// `.strict()`): a model that returns extra, unrequested fields alongside
// the expected shape is treated as invalid output, not silently accepted
// with the extras dropped — "do not trust the model's claimed JSON
// structure" applies to what it adds, not just what it's missing.
export const aiLeadAnalysisResponseSchema = z
  .object({
    summary: z.string().trim().min(1),
    websiteNeed: z.number().int().min(0).max(100),
    whatsappNeed: z.number().int().min(0).max(100),
    reviewAutomationNeed: z.number().int().min(0).max(100),
    voiceAgentNeed: z.number().int().min(0).max(100),
    recommendedService: serviceCodeSchema,
    estimatedDealMin: z.number().int().min(0),
    estimatedDealMax: z.number().int().min(0),
  })
  .strict()
  .refine((data) => data.estimatedDealMax >= data.estimatedDealMin, {
    message: "estimatedDealMax must be >= estimatedDealMin",
    path: ["estimatedDealMax"],
  });

export type AiLeadAnalysisResponse = z.infer<typeof aiLeadAnalysisResponseSchema>;
