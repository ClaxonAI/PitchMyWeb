import { describe, expect, it } from "vitest";
import { AiRequestError, OpenAiJsonClient, createAiClientFromEnv } from "./ai-client";
import { AiConfigurationError } from "../errors";

describe("createAiClientFromEnv", () => {
  it("builds an OpenAI client from OPENAI_API_KEY and OPENAI_MODEL", () => {
    const client = createAiClientFromEnv({ OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "gpt-4.1-mini" });
    expect(client).toBeInstanceOf(OpenAiJsonClient);
    expect(client.model).toBe("gpt-4.1-mini");
  });

  it("defaults the model to gpt-4o-mini, like the other OpenAI features", () => {
    expect(createAiClientFromEnv({ OPENAI_API_KEY: "sk-test" }).model).toBe("gpt-4o-mini");
  });

  it("throws AiConfigurationError (not a crash) without an API key", () => {
    expect(() => createAiClientFromEnv({})).toThrow(AiConfigurationError);
    expect(() => createAiClientFromEnv({ OPENAI_API_KEY: "  " })).toThrow(AiConfigurationError);
  });
});

describe("OpenAiJsonClient", () => {
  it("returns the model's text for the caller to validate", async () => {
    const client = new OpenAiJsonClient("gpt-test", async (prompt) => `{"echo":${JSON.stringify(prompt)}}`);
    const result = await client.generate({ prompt: "hello" });
    expect(JSON.parse(result.text)).toEqual({ echo: "hello" });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("reports provider failures as AiRequestError", async () => {
    const client = new OpenAiJsonClient("gpt-test", async () => {
      throw new Error("429 rate limited");
    });
    await expect(client.generate({ prompt: "hello" })).rejects.toThrow(AiRequestError);
  });
});
