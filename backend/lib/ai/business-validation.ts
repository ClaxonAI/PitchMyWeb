import type { Prisma, PrismaClient, Business } from "../../generated/prisma/client";
import { getServicePriceRange } from "../services/pricing";
import type { AiLeadAnalysisResponse } from "../validation/ai";
import { validateNoFabricatedPhoneNumber } from "./factual-safety";

type Db = PrismaClient | Prisma.TransactionClient;

export type BusinessValidationResult = { valid: true } | { valid: false; reason: string };

// Phase 5 section 9: business validation beyond Zod's structural checks.
// Zod already guarantees types/ranges/enum membership and
// estimatedDealMax >= estimatedDealMin; this layer checks things that
// require looking beyond the response itself — the database's configured
// services, and the business record the response is supposed to be about.

/**
 * `recommendedService` must not just be a syntactically valid ServiceCode
 * (Zod already checked that) — it must be an actually configured, active
 * service. An AI response naming a disabled/unconfigured service is
 * rejected the same as an invalid one (section 9: "recommendedService is
 * an allowed configured service").
 *
 * Deal estimate consistency: rather than requiring an exact match against
 * the configured price range (real deals reasonably vary), this requires
 * the AI's [estimatedDealMin, estimatedDealMax] range to *overlap* the
 * configured [priceMin, priceMax] range for that service — a deal
 * estimate with no overlap at all against the configured pricing for its
 * own recommended service is treated as inconsistent (section 9: "deal
 * estimate is consistent with configured service pricing").
 */
async function validatePricingConsistency(db: Db, data: AiLeadAnalysisResponse): Promise<BusinessValidationResult> {
  const priceRange = await getServicePriceRange(db, data.recommendedService);
  if (!priceRange) {
    return { valid: false, reason: `recommendedService "${data.recommendedService}" is not an active configured service` };
  }

  const overlaps = data.estimatedDealMin <= priceRange.priceMax && data.estimatedDealMax >= priceRange.priceMin;
  if (!overlaps) {
    return {
      valid: false,
      reason: `estimated deal range ${data.estimatedDealMin}-${data.estimatedDealMax} does not overlap the configured price range ${priceRange.priceMin}-${priceRange.priceMax} for "${data.recommendedService}"`,
    };
  }

  return { valid: true };
}

export type BusinessValidationInput = AiLeadAnalysisResponse;

/**
 * Runs every business-validation rule. Stops at the first failure (the
 * caller only needs one reason to reject and retry) rather than collecting
 * all of them — keeps the repair-prompt error message focused.
 */
export async function validateAiLeadAnalysisBusinessRules(db: Db, data: BusinessValidationInput, business: Pick<Business, "phone">): Promise<BusinessValidationResult> {
  const pricing = await validatePricingConsistency(db, data);
  if (!pricing.valid) return pricing;

  // Phase 7 extracted this check into lib/ai/factual-safety.ts so pitch
  // generation could reuse it verbatim instead of duplicating it.
  const factual = validateNoFabricatedPhoneNumber(data.summary, business.phone);
  if (!factual.valid) return factual;

  return { valid: true };
}
