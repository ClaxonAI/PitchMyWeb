import { ChatOpenAI } from "@langchain/openai";
import { AiConfigurationError } from "../errors";

// The model behind lead analysis and pitch generation. `AiClient` is the
// abstraction lib/ai/lead-analysis.service.ts and pitch.service.ts depend on:
// production wiring uses OpenAiJsonClient, tests inject their own fake
// implementation of this same interface, never a real network call
// (section 17).

export type AiGenerateInput = {
  prompt: string;
};

export type AiGenerateResult = {
  /** Raw text returned by the model — untrusted until parsed + Zod-validated by the caller. */
  text: string;
  latencyMs: number;
};

export interface AiClient {
  /** Recorded on each analysis/pitch. Test fakes may omit it. */
  readonly model?: string;
  generate(input: AiGenerateInput): Promise<AiGenerateResult>;
}

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Thrown for any failure reaching/using the model: connection failure,
 * non-2xx response, rate limit or timeout. Distinct from AiConfigurationError
 * (no API key) — this is an *upstream* failure, not a setup failure. The
 * services catch it and map it to a generic 502 without ever surfacing the
 * raw message to the client (section 19).
 */
export class AiRequestError extends Error {}

type ChatInvoke = (prompt: string) => Promise<string>;

/**
 * OpenAI in JSON mode, the same key and model setting discovery enrichment
 * and campaign-query parsing use. JSON mode only guarantees syntactically
 * valid JSON; the caller still parses and Zod-validates the text (section 7:
 * "do not trust the model's claimed JSON structure").
 */
export class OpenAiJsonClient implements AiClient {
  constructor(
    readonly model: string,
    private readonly invoke: ChatInvoke,
  ) {}

  static fromApiKey(apiKey: string, model: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): OpenAiJsonClient {
    const llm = new ChatOpenAI({ apiKey, model, temperature: 0.2, timeout: timeoutMs, maxRetries: 1 });
    return new OpenAiJsonClient(model, async (prompt) => {
      const message = await llm.invoke(prompt, { response_format: { type: "json_object" } });
      return typeof message.content === "string" ? message.content : "";
    });
  }

  async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
    const startedAt = Date.now();
    try {
      const text = await this.invoke(input.prompt);
      return { text, latencyMs: Date.now() - startedAt };
    } catch (error) {
      throw new AiRequestError(error instanceof Error ? error.message : "Unknown OpenAI request error");
    }
  }
}

/**
 * Builds the client from OPENAI_API_KEY / OPENAI_MODEL. Called lazily
 * (inside the route handler's request path, not at module load), so a
 * missing key surfaces as a normal caught AiConfigurationError (503) rather
 * than crashing the process at startup or import time (section 6).
 */
export function createAiClientFromEnv(env: Record<string, string | undefined> = process.env): AiClient {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AiConfigurationError("AI analysis is not configured: OPENAI_API_KEY must be set.");
  return OpenAiJsonClient.fromApiKey(apiKey, env.OPENAI_MODEL?.trim() || DEFAULT_MODEL);
}
