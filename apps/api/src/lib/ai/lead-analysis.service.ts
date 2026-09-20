import type { Lead, PrismaClient } from "@pitchmyweb/db";
import { getLeadForUser, applyLeadAnalysis, recordFailedLeadAnalysis } from "../leads/lead.service";
import { isLeadTransitionAllowed } from "../leads/lifecycle";
import { calculateOpportunityScore } from "../scoring/scoring";
import { aiLeadAnalysisResponseSchema, type AiLeadAnalysisResponse } from "../validation/ai";
import { buildLeadAnalysisAiInput, buildLeadAnalysisPrompt, buildRepairPrompt, AI_ANALYSIS_PROMPT_VERSION, type LeadAnalysisAiInput } from "./prompt";
import { validateAiLeadAnalysisBusinessRules } from "./business-validation";
import type { OllamaClient } from "./ollama-client";
import { AiAnalysisFailedError, InvalidLeadTransitionError } from "../errors";

// POST /api/leads/:id/analyze domain service (backend_tasks.md section 26,
// Phase 5). Implements exactly the required flow:
//
//   load lead (ownership-checked) -> load business
//     -> deterministic score (lib/scoring/scoring.ts, reused, not duplicated)
//     -> build AI input -> call Ollama -> parse -> Zod validate
//     -> business validate -> [repair once if invalid] -> persist
//     -> LEAD_ANALYZED -> transition to ANALYZED
//
// Route handlers only call analyzeLead(); no AI/business logic lives in
// app/api/leads/[id]/analyze/route.ts.

export type AnalyzeLeadInput = {
  leadId: string;
  userId: string;
};

export type AnalyzeLeadResult = {
  lead: Lead;
  repairUsed: boolean;
  latencyMs: number;
};

type AttemptOutcome = { success: true; data: AiLeadAnalysisResponse; raw: string; latencyMs: number } | { success: false; reason: string; raw?: string; latencyMs: number };

async function attemptOnce(db: PrismaClient, ollama: OllamaClient, prompt: string, business: { phone: string | null }): Promise<AttemptOutcome> {
  let text: string;
  let latencyMs: number;
  try {
    const result = await ollama.generate({ prompt });
    text = result.text;
    latencyMs = result.latencyMs;
  } catch (error) {
    // Connection failure / non-2xx / timeout, all raised by the client as
    // OllamaRequestError (section 13). No raw text to retry against.
    return { success: false, reason: error instanceof Error ? error.message : "Unknown Ollama request error", latencyMs: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { success: false, reason: "Ollama response was not valid JSON", raw: text, latencyMs };
  }

  const zodResult = aiLeadAnalysisResponseSchema.safeParse(parsed);
  if (!zodResult.success) {
    return { success: false, reason: `Ollama response failed schema validation: ${zodResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, raw: text, latencyMs };
  }

  const businessCheck = await validateAiLeadAnalysisBusinessRules(db, zodResult.data, business);
  if (!businessCheck.valid) {
    return { success: false, reason: businessCheck.reason, raw: text, latencyMs };
  }

  return { success: true, data: zodResult.data, raw: text, latencyMs };
}

/**
 * Runs the analysis pipeline for one lead. Ollama is injectable
 * (section 17: tests never depend on a real Ollama server) — production
 * routes pass a real HttpOllamaClient, tests pass a fake OllamaClient.
 *
 * Retry behavior (section 12): if the first attempt is invalid for any
 * reason (JSON parse failure, Zod failure, business-rule failure), exactly
 * one repair prompt is sent, including the invalid response and why it was
 * rejected. If the repaired attempt is also invalid, the whole operation
 * fails — no unbounded loop, no third attempt.
 *
 * Nothing is persisted until a valid result exists (section 9/12/14): the
 * deterministic score/LeadScore/Lead fields/LEAD_ANALYZED
 * activity/ANALYZED transition are only ever written by the single
 * successful-path call to applyLeadAnalysis at the end, inside one
 * transaction. A failed operation writes only a diagnostic LeadAnalysis
 * row (recordFailedLeadAnalysis) and leaves the Lead completely untouched,
 * so a later retry remains possible.
 */
export async function analyzeLead(db: PrismaClient, ollama: OllamaClient, input: AnalyzeLeadInput): Promise<AnalyzeLeadResult> {
  const lead = await getLeadForUser(db, input.userId, input.leadId);

  // Respect the existing lifecycle graph rather than bypassing it (section
  // 15): checked up front so an already-analyzed (or otherwise ineligible)
  // lead is rejected immediately with a clear 409, instead of spending an
  // Ollama call on a request that is guaranteed to fail at the final
  // transition step anyway.
  if (!isLeadTransitionAllowed(lead.status, "ANALYZED")) {
    throw new InvalidLeadTransitionError(lead.status, "ANALYZED");
  }

  // Deterministic score (section 3): computed once here, from the same
  // scoring service Phase 2/3 already built and tested — never
  // recalculated or overridden by anything AI-related below.
  const score = calculateOpportunityScore(lead.business);

  const aiInput: LeadAnalysisAiInput = buildLeadAnalysisAiInput(lead.business, score);
  const initialPrompt = buildLeadAnalysisPrompt(aiInput);

  let outcome = await attemptOnce(db, ollama, initialPrompt, lead.business);
  let repairUsed = false;
  let totalLatencyMs = outcome.latencyMs;

  if (!outcome.success) {
    repairUsed = true;
    const repairPrompt = buildRepairPrompt(aiInput, outcome.raw ?? "(no response text)", outcome.reason);
    const repaired = await attemptOnce(db, ollama, repairPrompt, lead.business);
    totalLatencyMs += repaired.latencyMs;
    outcome = repaired;
  }

  if (!outcome.success) {
    await recordFailedLeadAnalysis(db, {
      leadId: lead.id,
      promptVersion: AI_ANALYSIS_PROMPT_VERSION,
      modelName: process.env.OLLAMA_MODEL ?? "unknown",
      latencyMs: totalLatencyMs,
      repairUsed,
      // Section 19: never persist/return the raw exception — this is
      // already a short, safe, human-written reason string (Zod issue
      // summaries and fixed messages only), not a stack trace or raw
      // upstream body, but is still kept out of the client-facing error
      // (AiAnalysisFailedError's message is a fixed generic string).
      errorMessage: outcome.reason,
    });
    throw new AiAnalysisFailedError();
  }

  const updatedLead = await applyLeadAnalysis(db, {
    leadId: lead.id,
    score,
    recommendedService: outcome.data.recommendedService,
    estimatedDealMin: outcome.data.estimatedDealMin,
    estimatedDealMax: outcome.data.estimatedDealMax,
    aiMetadata: {
      summary: outcome.data.summary,
      websiteNeed: outcome.data.websiteNeed,
      whatsappNeed: outcome.data.whatsappNeed,
      reviewAutomationNeed: outcome.data.reviewAutomationNeed,
      voiceAgentNeed: outcome.data.voiceAgentNeed,
      modelName: process.env.OLLAMA_MODEL ?? "unknown",
      promptVersion: AI_ANALYSIS_PROMPT_VERSION,
      latencyMs: totalLatencyMs,
      repairUsed,
    },
  });

  return { lead: updatedLead, repairUsed, latencyMs: totalLatencyMs };
}
