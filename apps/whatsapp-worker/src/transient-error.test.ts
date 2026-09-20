import { describe, expect, it } from "vitest";
import { isTransientNetworkError } from "./transient-error.js";

// This predicate decides whether the whole worker dies.
//
// It exists because a plain ECONNRESET on one account's WhatsApp socket
// reaches the process as an uncaught exception — undici emits an `error`
// event on a stream nothing subscribes to — and killing the process would
// drop every other tenant's session with it. Getting the predicate too
// narrow means that outage; too broad means surviving genuine programming
// errors in an undefined state.

describe("isTransientNetworkError", () => {
  it("matches an error carrying a network code", () => {
    const error = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  // The shape actually observed in this phase: undici reports
  // `TypeError: terminated` and tucks the real cause underneath.
  it("matches undici's terminated wrapper with the cause underneath", () => {
    const cause = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    const error = Object.assign(new TypeError("terminated"), { cause });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("matches a bare terminated TypeError", () => {
    expect(isTransientNetworkError(new TypeError("terminated"))).toBe(true);
  });

  it.each([["ECONNREFUSED"], ["EPIPE"], ["ETIMEDOUT"], ["ENOTFOUND"], ["EHOSTUNREACH"], ["ENETUNREACH"], ["UND_ERR_SOCKET"]])(
    "matches %s",
    (code) => {
      expect(isTransientNetworkError(Object.assign(new Error("boom"), { code }))).toBe(true);
    },
  );

  it("walks a nested cause chain", () => {
    const root = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    const middle = Object.assign(new Error("wrapped"), { cause: root });
    const outer = Object.assign(new Error("outer"), { cause: middle });
    expect(isTransientNetworkError(outer)).toBe(true);
  });

  // Programming errors must still take the process down, so a supervisor
  // restarts it cleanly rather than leaving it running in an unknown state.
  it.each([
    ["a plain TypeError", new TypeError("x is not a function")],
    ["a reference error", new ReferenceError("foo is not defined")],
    ["an unlabelled error", new Error("something went wrong")],
    ["a non-network code", Object.assign(new Error("db"), { code: "P2002" })],
  ])("does not match %s", (_label, error) => {
    expect(isTransientNetworkError(error)).toBe(false);
  });

  it.each([[undefined], [null], ["a string"], [42]])("does not match a non-error value (%s)", (value) => {
    expect(isTransientNetworkError(value)).toBe(false);
  });

  it("terminates on a self-referential cause chain instead of looping", () => {
    const error: Error & { cause?: unknown } = new Error("cyclic");
    error.cause = error;
    expect(isTransientNetworkError(error)).toBe(false);
  });
});
