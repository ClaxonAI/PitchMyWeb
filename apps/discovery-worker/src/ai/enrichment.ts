import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type { DiscoveryQuery } from "../sources/index.js";

// AI enrichment for a Serper-discovered business: one structured LLM call
// producing exactly what apps/api's discoveryInsightsSchema accepts
// (summary/services/outreachMessage) — see lib/validation/business.ts. That
// schema strips markup/URLs and bounds every field server-side, so this
// only needs to produce reasonable text, not perfectly clean text.
//
// This replaces the old n8n workflow's two separate OpenAI nodes ("Analyse
// Business (AI)" + "Generate Outreach message") with a single call: same
// business context is used for both, so there's no reason to pay for two
// round trips or juggle two rate-limit budgets.

const insightsSchema = z.object({
  services: z.array(z.string()).min(1).max(8).describe("The business's main service offerings, short phrases"),
  summary: z.string().min(1).describe("One natural, specific sentence about this business"),
  outreachMessage: z
    .string()
    .min(1)
    .describe(
      "A short cold-outreach message: one-line hook (specific observation), one-line problem (relevant inefficiency), " +
        "1-2 lines of value (what a website/AI automation delivers for them), an optional one-line proof point, " +
        "and a one-line low-friction CTA question. Joined into a single natural paragraph, no labels or headers.",
    ),
});

export type BusinessInsights = z.infer<typeof insightsSchema>;

export type BusinessForEnrichment = {
  name: string;
  category: string;
  rating: number | null;
  reviewCount: number | null;
};

const PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a B2B copywriter and business analyst working for a web-design agency that reaches out to local " +
      "businesses with no website. For each business, infer its likely services from its name/category and write " +
      "one specific, natural summary sentence, then a short personalized cold-outreach message pitching a website " +
      "build. Rules: no generic phrases ('hope you're well'), no hype or exaggerated claims, keep sentences short " +
      "and concrete, make it feel tailored not mass outreach, never leave a field empty.",
  ],
  [
    "human",
    "Business Name: {name}\nCategory: {category}\nRating: {rating}\nReview count: {reviewCount}\n" +
      "This business currently has no website.",
  ],
]);

export type EnrichmentClient = {
  enrich(business: BusinessForEnrichment): Promise<BusinessInsights | null>;
};

export type OpenAiEnrichmentOptions = {
  apiKey: string;
  model: string;
  temperature?: number;
};

/** Real implementation, backed by LangChain + OpenAI structured output. */
export class OpenAiEnrichmentClient implements EnrichmentClient {
  private readonly chain: ReturnType<typeof PROMPT.pipe>;

  constructor(options: OpenAiEnrichmentOptions) {
    const llm = new ChatOpenAI({ apiKey: options.apiKey, model: options.model, temperature: options.temperature ?? 0.7 });
    this.chain = PROMPT.pipe(llm.withStructuredOutput(insightsSchema, { name: "business_insights" }));
  }

  async enrich(business: BusinessForEnrichment): Promise<BusinessInsights | null> {
    try {
      return (await this.chain.invoke({
        name: business.name,
        category: business.category,
        rating: business.rating ?? "unknown",
        reviewCount: business.reviewCount ?? "unknown",
      })) as BusinessInsights;
    } catch {
      // AI enrichment is a nice-to-have, not a hard requirement — a failed
      // call (rate limit, malformed output) should not fail the whole
      // business record. The business still gets discovered and scored;
      // it just arrives without insights.summary/services/outreachMessage.
      return null;
    }
  }
}

/** A no-op client for when AI enrichment isn't configured (no OPENAI_API_KEY). */
export class NullEnrichmentClient implements EnrichmentClient {
  async enrich(): Promise<BusinessInsights | null> {
    return null;
  }
}

export type { DiscoveryQuery };
