import { NullCampaignQueryParser, OpenAiCampaignQueryParser, type CampaignQueryParser, type ParsedCampaignQuery } from "./campaign-query-parser";

export type ParseCampaignQueryResult =
  | { parsed: ParsedCampaignQuery }
  | { parsed: null; reason: "not_configured" | "parse_failed" };

export function resolveCampaignQueryParser(
  env: Record<string, string | undefined> = process.env,
  override?: CampaignQueryParser,
): CampaignQueryParser | null {
  if (override) return override;
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return OpenAiCampaignQueryParser.fromApiKey(apiKey, env.OPENAI_MODEL?.trim() || "gpt-4o-mini");
}

export async function parseCampaignQuery(
  query: string,
  parser: CampaignQueryParser | null = resolveCampaignQueryParser(),
): Promise<ParseCampaignQueryResult> {
  if (!parser) return { parsed: null, reason: "not_configured" };
  const parsed = await parser.parse(query);
  if (!parsed) return { parsed: null, reason: "parse_failed" };
  return { parsed };
}

export { NullCampaignQueryParser };
