import { afterEach, describe, expect, it, vi } from "vitest";
import { captureEvents, emitEvent, sendAlert } from "./events";

const originalUrl = process.env.ALERT_WEBHOOK_URL;
afterEach(() => {
  if (originalUrl === undefined) delete process.env.ALERT_WEBHOOK_URL;
  else process.env.ALERT_WEBHOOK_URL = originalUrl;
});

describe("emitEvent", () => {
  it("writes one structured JSON entry with the event name and fields", () => {
    const entries: Record<string, unknown>[] = [];
    const restore = captureEvents((e) => entries.push(e));
    emitEvent("lead_discovery.run_failed", { executionId: "ex1", reason: "timeout" }, { level: "error" });
    restore();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ event: "lead_discovery.run_failed", level: "error", service: "api", executionId: "ex1", reason: "timeout" });
    expect(typeof entries[0]!.ts).toBe("string");
  });
});

describe("sendAlert", () => {
  it("does nothing when ALERT_WEBHOOK_URL is not set", async () => {
    delete process.env.ALERT_WEBHOOK_URL;
    const fetchImpl = vi.fn();
    await expect(sendAlert("lead_discovery.run_failed", {}, fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts a Slack-compatible text body", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example/alert";
    const fetchImpl = vi.fn(async () => new Response("ok"));
    await expect(sendAlert("lead_discovery.run_failed", { executionId: "ex1", reason: "timeout", ignored: undefined }, fetchImpl as unknown as typeof fetch)).resolves.toBe(true);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.example/alert");
    const text = JSON.parse(init.body as string).text as string;
    expect(text).toContain("lead_discovery.run_failed");
    expect(text).toContain("executionId=ex1");
    expect(text).not.toContain("ignored");
  });

  it("never throws when the alert channel fails", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example/alert";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(sendAlert("lead_discovery.run_failed", {}, failing as unknown as typeof fetch)).resolves.toBe(false);
    const rejected = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(sendAlert("lead_discovery.run_failed", {}, rejected as unknown as typeof fetch)).resolves.toBe(false);
    warn.mockRestore();
  });
});
