import type { Pitch, PrismaClient } from "@pitchmyweb/db";
import { persistGeneratedPitch } from "../leads/lead.service";
import { getServicePriceRange } from "../services/pricing";
import { aiPitchResponseSchema, type AiPitchResponse } from "../validation/pitch";
import { buildPitchAiInput, buildPitchPrompt, buildPitchRepairPrompt, PITCH_PROMPT_VERSION, type PitchAiInput } from "./pitch-prompt";
import { validateNoFabricatedPhoneNumber } from "./factual-safety";
import type { OllamaClient } from "./ollama-client";
import { AiPitchFailedError, ConflictError, NotFoundError } from "../errors";

// POST /api/leads/:id/pitch domain service (backend_tasks.md section 31,
// Phase 7). Implements exactly the required flow:
//
//   load lead (ownership-checked) -> business -> website/demo if available
//     -> Lead.recommendedService (already validated by Phase 5, authoritative
//        — see below) -> configured pricing (lib/services/pricing.ts)
//     -> build AI input -> call Ollama -> parse -> Zod validate
//     -> business/factual validate -> [repair once if invalid] -> persist
//     -> PITCH_GENERATED
//
// Route handlers only call generatePitch(); no AI/business logic lives in
// app/api/leads/[id]/pitch/route.ts.
//
// Authority for recommendedService (section 8): Lead.recommendedService is
// set exactly once, by Phase 5's applyLeadAnalysis, from an AI response
// that was already Zod- and business-validated against configured Services
// at that time. This function treats that persisted value as authoritative
// and never re-decides it — the pitch-generation Ollama call is never asked
// to choose or restate a recommendedService/deal range; its only output is
// the outreach message text (see aiPitchResponseSchema). This avoids
// creating a second, conflicting authority for the same decision.

export type GeneratePitchInput = {
  leadId: string;
  userId: string;
};

export type GeneratePitchResult = {
  pitch: Pitch;
  repairUsed: boolean;
  latencyMs: number;
};

type AttemptOutcome = { success: true; data: AiPitchResponse; raw: string; latencyMs: number } | { success: false; reason: string; raw?: string; latencyMs: number };

async function attemptOnce(ollama: OllamaClient, prompt: string, business: { phone: string | null }): Promise<AttemptOutcome> {
  let text: string;
  let latencyMs: number;
  try {
    const result = await ollama.generate({ prompt });
    text = result.text;
    latencyMs = result.latencyMs;
  } catch (error) {
    return { success: false, reason: error instanceof Error ? error.message : "Unknown Ollama request error", latencyMs: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { success: false, reason: "Ollama response was not valid JSON", raw: text, latencyMs };
  }

  const zodResult = aiPitchResponseSchema.safeParse(parsed);
  if (!zodResult.success) {
    return { success: false, reason: `Ollama response failed schema validation: ${zodResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, raw: text, latencyMs };
  }

  // Factual safety (section 7): reuses the exact same heuristic
  // lead-analysis uses (lib/ai/factual-safety.ts) rather than a second copy.
  const factual = validateNoFabricatedPhoneNumber(zodResult.data.message, business.phone);
  if (!factual.valid) {
    return { success: false, reason: factual.reason, raw: text, latencyMs };
  }

  return { success: true, data: zodResult.data, raw: text, latencyMs };
}

/**
 * Runs the pitch-generation pipeline for one lead. Ollama is injectable
 * (section 17 precedent from Phase 5: tests never depend on a real Ollama
 * server) — the real HttpOllamaClient in production, a fake in tests.
 *
 * Retry behavior mirrors lib/ai/lead-analysis.service.ts exactly: exactly
 * one repair attempt on any failure (malformed JSON, schema-invalid,
 * factually-unsafe), never a third attempt.
 *
 * Nothing is persisted until a valid result exists. A failed operation
 * persists nothing at all (Pitch.content is non-nullable — see
 * lib/leads/lead.service.ts's persistGeneratedPitch doc comment) and
 * throws a generic, sanitized AiPitchFailedError — the Lead and any prior
 * valid Pitch are left completely untouched, so a later retry remains
 * possible.
 */
export async function generatePitch(db: PrismaClient, ollama: OllamaClient, input: GeneratePitchInput): Promise<GeneratePitchResult> {
  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    include: {
      campaign: { select: { userId: true } },
      business: true,
      websiteProjects: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!lead || lead.campaign.userId !== input.userId) {
    throw new NotFoundError("Lead", input.leadId);
  }

  // Data precondition, not a lifecycle-status gate (section 12: pitch
  // generation is not itself a lifecycle transition, so there is no
  // isLeadTransitionAllowed pre-check here the way analyze/publish have —
  // only the data this function actually needs is required to be present).
  if (!lead.recommendedService) {
    throw new ConflictError("Lead must be analyzed (recommendedService set) before a pitch can be generated");
  }

  const pricing = await getServicePriceRange(db, lead.recommendedService);
  if (!pricing) {
    // Service was deactivated/removed after the lead was analyzed.
    throw new ConflictError(`Recommended service "${lead.recommendedService}" is not an active configured service`);
  }

  // Section 9: include the current demo site only if one exists; omit
  // entirely (never fabricate) otherwise. "Current" = the most recently
  // created WebsiteProject, whose own contentJSON/template columns already
  // reflect its latest version (Phase 6 design).
  const project = lead.websiteProjects[0] ?? null;
  const demoSite = project ? { template: project.template, demoUrl: project.demoUrl } : null;

  const aiInput: PitchAiInput = buildPitchAiInput({
    business: lead.business,
    recommendedService: lead.recommendedService,
    pricing,
    estimatedDealMin: lead.estimatedDealMin,
    estimatedDealMax: lead.estimatedDealMax,
    demoSite,
  });
  const initialPrompt = buildPitchPrompt(aiInput);

  let outcome = await attemptOnce(ollama, initialPrompt, lead.business);
  let repairUsed = false;
  let totalLatencyMs = outcome.latencyMs;

  if (!outcome.success) {
    repairUsed = true;
    const repairPrompt = buildPitchRepairPrompt(aiInput, outcome.raw ?? "(no response text)", outcome.reason);
    const repaired = await attemptOnce(ollama, repairPrompt, lead.business);
    totalLatencyMs += repaired.latencyMs;
    outcome = repaired;
  }

  if (!outcome.success) {
    // Section 19: never expose the raw reason to the client; it's already
    // a short, safe, human-written string (Zod issue summaries and fixed
    // messages only), logged server-side for diagnostics, not persisted
    // anywhere (Pitch.content is non-nullable — see the note above).
    console.error(`Pitch generation for lead ${lead.id} failed after repair: ${outcome.reason}`);
    throw new AiPitchFailedError();
  }

  const pitch = await persistGeneratedPitch(db, {
    leadId: lead.id,
    content: outcome.data.message,
    promptVersion: PITCH_PROMPT_VERSION,
    modelName: ollama.model ?? process.env.OLLAMA_MODEL ?? "unknown",
  });

  return { pitch, repairUsed, latencyMs: totalLatencyMs };
}
