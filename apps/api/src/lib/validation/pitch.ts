import { z } from "zod";
import { paginationQuerySchema, pitchStatusSchema } from "./common";

// backend_tasks.md section 14. Pitch content is generated content but must
// still be persisted through a validated shape (Rule 6: AI output is
// untrusted until it passes validation).
//
// Drafted in Phase 2 before the AI generation flow existed, and NOT used by
// the final Phase 7 design: pitch content only ever comes from Ollama
// (validated by aiPitchResponseSchema below), never from a client-supplied
// request body, so no route parses a request against pitchCreateSchema.
// Left in place (harmless, matches the project's "do not modify unrelated
// schema" guidance) but documented here so it isn't mistaken for the real
// request contract.
export const pitchCreateSchema = z.object({
  leadId: z.string().trim().min(1),
  content: z.string().trim().min(1),
  promptVersion: z.string().trim().min(1),
  modelName: z.string().trim().min(1),
  status: pitchStatusSchema.default("PENDING"),
});

export type PitchCreateInput = z.infer<typeof pitchCreateSchema>;

export const pitchUpdateSchema = z.object({
  content: z.string().trim().min(1).optional(),
  status: pitchStatusSchema.optional(),
});

export type PitchUpdateInput = z.infer<typeof pitchUpdateSchema>;

// Same "drafted early, superseded" note as pitchCreateSchema above: the
// final Phase 7 design for POST /api/leads/:id/whatsapp takes no request
// body at all (it derives the lead's own most recent generated Pitch
// internally rather than accepting a client-supplied pitchId), and
// POST /api/leads/:id/pitch confirmation reuses the existing generic
// PATCH /api/leads/:id lifecycle endpoint (leadPatchSchema) rather than a
// dedicated "confirm send" endpoint — see the Phase 7 report for why.
export const whatsappActionRequestSchema = z.object({
  pitchId: z.string().trim().min(1),
});

export type WhatsappActionRequest = z.infer<typeof whatsappActionRequestSchema>;

export const whatsappConfirmSendSchema = z.object({
  outreachId: z.string().trim().min(1),
});

export type WhatsappConfirmSendInput = z.infer<typeof whatsappConfirmSendSchema>;

// Ollama pitch structured-output contract (Phase 7 section 6). A single
// message field — pitch generation reuses the lead's already-validated
// Lead.recommendedService/estimatedDealMin/Max (Phase 5) as context, it
// never asks the model to re-decide them, so there is nothing else
// structured for Ollama to return here. `.strict()`: an unexpected extra
// field is treated as invalid output, not silently dropped, same
// convention as aiLeadAnalysisResponseSchema.
export const aiPitchResponseSchema = z
  .object({
    message: z.string().trim().min(1).max(1200, "message must be at most 1200 characters (kept short enough to be WhatsApp-appropriate)"),
  })
  .strict();

export type AiPitchResponse = z.infer<typeof aiPitchResponseSchema>;

// GET /api/pitches (Phase 1 dashboard's standalone Pitches list): optional
// campaignId/leadId/status narrow the list, all scoped server-side to the
// caller's own campaigns regardless of what's passed.
export const pitchListQuerySchema = paginationQuerySchema.extend({
  campaignId: z.string().trim().min(1).optional(),
  leadId: z.string().trim().min(1).optional(),
  status: pitchStatusSchema.optional(),
});

export type PitchListQuery = z.infer<typeof pitchListQuerySchema>;
