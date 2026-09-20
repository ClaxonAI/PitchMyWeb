import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

export const parsedCampaignQuerySchema = z.object({
  category: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  minRating: z.number().min(0).max(5).optional(),
  minReviews: z.number().int().min(0).optional(),
  websiteRequirement: z.enum(["ANY", "WITH_WEBSITE", "WITHOUT_WEBSITE"]).optional(),
  targetCount: z.number().int().min(1).max(200).optional(),
});

export type ParsedCampaignQuery = z.infer<typeof parsedCampaignQuerySchema>;

export interface CampaignQueryParser {
  parse(query: string): Promise<ParsedCampaignQuery | null>;
}

type InvokeFn = (input: { query: string }) => Promise<unknown>;

const PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    "Extract campaign search filters from the user's natural-language request. " +
      "Only fill fields the text actually implies — never invent a category, location, rating, review count, " +
      "website requirement, or lead count that is not clearly present. Omit any field you are not sure about. " +
      "Do not invent a campaign name.",
  ],
  ["human", "{query}"],
]);

export class OpenAiCampaignQueryParser implements CampaignQueryParser {
  constructor(private readonly invoke: InvokeFn) {}

  static fromApiKey(apiKey: string, model: string): OpenAiCampaignQueryParser {
    const llm = new ChatOpenAI({ apiKey, model, temperature: 0 });
    const chain = PROMPT.pipe(llm.withStructuredOutput(parsedCampaignQuerySchema, { name: "parsed_campaign_query" }));
    return new OpenAiCampaignQueryParser((input) => chain.invoke(input));
  }

  async parse(query: string): Promise<ParsedCampaignQuery | null> {
    try {
      const raw = await this.invoke({ query });
      const parsed = parsedCampaignQuerySchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}

export class NullCampaignQueryParser implements CampaignQueryParser {
  async parse(_query: string): Promise<ParsedCampaignQuery | null> {
    return null;
  }
}
