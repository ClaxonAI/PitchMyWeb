import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpOllamaClient, OllamaRequestError, createOllamaClientFromEnv } from "./ollama-client";
import { AiConfigurationError } from "../errors";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("createOllamaClientFromEnv", () => {
  it("throws AiConfigurationError (not a crash) when OLLAMA_BASE_URL is missing", () => {
    process.env.OLLAMA_BASE_URL = "";
    process.env.OLLAMA_MODEL = "llama3";
    expect(() => createOllamaClientFromEnv()).toThrow(AiConfigurationError);
  });

  it("throws AiConfigurationError when OLLAMA_MODEL is missing", () => {
    process.env.OLLAMA_BASE_URL = "http://ollama:11434";
    process.env.OLLAMA_MODEL = "";
    expect(() => createOllamaClientFromEnv()).toThrow(AiConfigurationError);
  });

  it("returns a client when both are configured", () => {
    process.env.OLLAMA_BASE_URL = "http://ollama:11434";
    process.env.OLLAMA_MODEL = "llama3";
    expect(() => createOllamaClientFromEnv()).not.toThrow();
  });
});

describe("HttpOllamaClient", () => {
  it("uses OLLAMA_BASE_URL/OLLAMA_MODEL from the provided config, never hardcoded", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("http://custom-ollama-host:9999/api/generate");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("custom-model-name");
      return new Response(JSON.stringify({ response: '{"ok":true}' }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpOllamaClient("http://custom-ollama-host:9999", "custom-model-name");
    const result = await client.generate({ prompt: "hello" });
    expect(result.text).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns the measured latency", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ response: "{}" }), { status: 200 })),
    );
    const client = new HttpOllamaClient("http://ollama:11434", "llama3");
    const result = await client.generate({ prompt: "hi" });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("throws OllamaRequestError on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("server error", { status: 500 })),
    );
    const client = new HttpOllamaClient("http://ollama:11434", "llama3");
    await expect(client.generate({ prompt: "hi" })).rejects.toThrow(OllamaRequestError);
  });

  it("throws OllamaRequestError on a connection failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const client = new HttpOllamaClient("http://unreachable-host:11434", "llama3");
    await expect(client.generate({ prompt: "hi" })).rejects.toThrow(OllamaRequestError);
  });

  it("throws OllamaRequestError on timeout without hanging the test", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }),
    );
    const client = new HttpOllamaClient("http://slow-host:11434", "llama3", 20); // 20ms timeout
    await expect(client.generate({ prompt: "hi" })).rejects.toThrow(OllamaRequestError);
  });
});
