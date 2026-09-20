import { AiConfigurationError } from "../errors";

// Dedicated Ollama client/service (backend_tasks.md section 27, Phase 5
// section 6). `OllamaClient` is the abstraction lib/ai/lead-analysis.service.ts
// depends on — production wiring uses HttpOllamaClient (real HTTP calls to
// a running Ollama server), tests inject their own fake implementation of
// this same interface, never a real network call (section 17).

export type OllamaGenerateInput = {
  prompt: string;
};

export type OllamaGenerateResult = {
  /** Raw text returned by the model — untrusted until parsed + Zod-validated by the caller. */
  text: string;
  latencyMs: number;
};

export interface OllamaClient {
  generate(input: OllamaGenerateInput): Promise<OllamaGenerateResult>;
}

// Not exposed as a configurable env var: the task's required configuration
// surface is exactly OLLAMA_BASE_URL/OLLAMA_MODEL (section 6), and a fixed,
// generous timeout is a reasonable default (Rule 10) rather than scope
// creep into a third env var this phase was never asked for.
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Thrown by HttpOllamaClient for any failure reaching/using the Ollama
 * server: connection refused, non-2xx response, or timeout. Distinct from
 * AiConfigurationError (missing env vars) — this is an *upstream* failure,
 * not a setup failure. lib/ai/lead-analysis.service.ts catches this and
 * maps it to AiAnalysisFailedError (502) without ever surfacing the raw
 * message to the client (section 19).
 */
export class OllamaRequestError extends Error {}

export class HttpOllamaClient implements OllamaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async generate(input: OllamaGenerateInput): Promise<OllamaGenerateResult> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // format: "json" asks Ollama itself to constrain output to valid
        // JSON where the model supports it — a best-effort assist, not a
        // substitute for the Zod validation the caller always performs
        // (section 7: "do not trust the model's claimed JSON structure").
        body: JSON.stringify({ model: this.model, prompt: input.prompt, format: "json", stream: false }),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        throw new OllamaRequestError(`Ollama responded with HTTP ${response.status}`);
      }

      const body: unknown = await response.json();
      const text = typeof body === "object" && body !== null && typeof (body as { response?: unknown }).response === "string" ? (body as { response: string }).response : "";
      return { text, latencyMs };
    } catch (error) {
      if (error instanceof OllamaRequestError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new OllamaRequestError(`Ollama request timed out after ${this.timeoutMs}ms`);
      }
      throw new OllamaRequestError(error instanceof Error ? error.message : "Unknown Ollama request error");
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Builds a real Ollama client from environment configuration. Called
 * lazily (inside the route handler's request path, not at module load),
 * so a missing/incomplete configuration surfaces as a normal caught
 * AiConfigurationError (503) rather than crashing the process at startup
 * or import time (section 6).
 */
export function createOllamaClientFromEnv(): OllamaClient {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_MODEL;
  if (!baseUrl || !model) {
    throw new AiConfigurationError("AI analysis is not configured: OLLAMA_BASE_URL and OLLAMA_MODEL must both be set.");
  }
  return new HttpOllamaClient(baseUrl, model);
}
