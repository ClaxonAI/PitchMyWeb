import { Boom } from "@hapi/boom";
import { DisconnectReason } from "baileys";
import { describe, expect, it } from "vitest";
import { classifyDisconnect, statusCodeOf } from "./disconnect-reason.js";

// This mapping decides whether a dropped account comes back on its own, asks
// the user to relink, or gives up. Getting a branch wrong is not a cosmetic
// bug: treating a logout as transient means retrying forever against
// credentials WhatsApp has revoked, and treating a network blip as a logout
// means wiping a working account's credentials.

function boom(statusCode: number): Boom {
  return new Boom("closed", { statusCode });
}

describe("classifyDisconnect", () => {
  it("treats a logout as terminal and requiring a relink", () => {
    const outcome = classifyDisconnect(boom(DisconnectReason.loggedOut));
    expect(outcome.action).toBe("logged_out");
  });

  it("treats a multidevice mismatch as requiring a relink", () => {
    expect(classifyDisconnect(boom(DisconnectReason.multideviceMismatch)).action).toBe("logged_out");
  });

  it.each([
    ["connectionClosed", DisconnectReason.connectionClosed],
    ["connectionLost", DisconnectReason.connectionLost],
    ["timedOut", DisconnectReason.timedOut],
    ["restartRequired", DisconnectReason.restartRequired],
    ["unavailableService", DisconnectReason.unavailableService],
    ["badSession", DisconnectReason.badSession],
  ])("treats %s as transient", (_label, code) => {
    expect(classifyDisconnect(boom(code)).action).toBe("reconnect");
  });

  it.each([
    ["connectionReplaced", DisconnectReason.connectionReplaced],
    ["forbidden", DisconnectReason.forbidden],
  ])("treats %s as fatal", (_label, code) => {
    expect(classifyDisconnect(boom(code)).action).toBe("fatal");
  });

  // An unlabelled close is the common case for an ordinary network drop.
  // Declaring a working account dead there would be the worse failure, so
  // the default has to be "retry".
  it("treats an unrecognised status code as transient", () => {
    expect(classifyDisconnect(boom(418)).action).toBe("reconnect");
  });

  it("treats a plain Error as transient", () => {
    expect(classifyDisconnect(new Error("socket hang up")).action).toBe("reconnect");
  });

  it("treats undefined as transient", () => {
    expect(classifyDisconnect(undefined).action).toBe("reconnect");
  });

  it("always returns a non-empty reason", () => {
    for (const error of [boom(DisconnectReason.loggedOut), boom(DisconnectReason.forbidden), new Error("x"), undefined]) {
      expect(classifyDisconnect(error).reason.length).toBeGreaterThan(0);
    }
  });
});

describe("statusCodeOf", () => {
  it("reads the code off a Boom error", () => {
    expect(statusCodeOf(boom(401))).toBe(401);
  });

  it("reads the code off a Boom-shaped plain object", () => {
    expect(statusCodeOf({ output: { statusCode: 428 } })).toBe(428);
  });

  it("returns undefined for anything else", () => {
    expect(statusCodeOf(new Error("plain"))).toBeUndefined();
    expect(statusCodeOf(undefined)).toBeUndefined();
    expect(statusCodeOf({ output: { statusCode: "401" } })).toBeUndefined();
  });
});
