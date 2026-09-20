import { describe, expect, it, vi } from "vitest";
import { OperationTimeoutError, withTimeout } from "./with-timeout.js";

// This bound exists because a real send hung for two minutes during manual
// verification: Baileys was resolving a recipient it had no session with,
// and `sendMessage` has no ceiling of its own. With send concurrency at 1, a
// call that never returns pins the message at SENDING and blocks every other
// send in the process behind it.

describe("withTimeout", () => {
  it("returns the value when the operation finishes in time", async () => {
    await expect(withTimeout("fast", 1_000, async () => "done")).resolves.toBe("done");
  });

  it("rejects with OperationTimeoutError when it does not", async () => {
    const promise = withTimeout("slow", 20, () => new Promise(() => {}));
    await expect(promise).rejects.toBeInstanceOf(OperationTimeoutError);
  });

  it("names the operation and the budget in the error", async () => {
    try {
      await withTimeout("sendText", 15, () => new Promise(() => {}));
      expect.unreachable("should have timed out");
    } catch (error) {
      expect(error).toBeInstanceOf(OperationTimeoutError);
      expect((error as OperationTimeoutError).operation).toBe("sendText");
      expect((error as OperationTimeoutError).timeoutMs).toBe(15);
      expect((error as Error).message).toContain("15ms");
    }
  });

  // The underlying error must win, so a real provider failure is still
  // reported as itself rather than as a timeout.
  it("propagates the operation's own rejection", async () => {
    const boom = new Error("WhatsApp rejected the message");
    await expect(withTimeout("failing", 1_000, async () => Promise.reject(boom))).rejects.toBe(boom);
  });

  it("does not leave a pending timer behind on success", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    await withTimeout("fast", 5_000, async () => "ok");
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("resolves with a value produced just before the deadline", async () => {
    const result = await withTimeout("just-in-time", 200, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "made it";
    });
    expect(result).toBe("made it");
  });
});
