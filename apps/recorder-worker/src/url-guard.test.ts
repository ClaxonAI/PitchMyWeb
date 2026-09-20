import { describe, expect, it } from "vitest";
import { assertPreviewUrl, UrlNotAllowedError } from "./url-guard.js";

const SITES = "https://preview.pitchmyweb.com";

describe("assertPreviewUrl", () => {
  it("accepts preview pages on the configured origin", () => {
    expect(assertPreviewUrl("https://preview.pitchmyweb.com/s/lotus-smile-1a2b3c4d", SITES).pathname).toBe("/s/lotus-smile-1a2b3c4d");
    expect(assertPreviewUrl("http://localhost:3200/s/clinic-abc", "http://localhost:3200/").host).toBe("localhost:3200");
    expect(assertPreviewUrl("https://example.com/previews/s/clinic-abc", "https://example.com/previews").pathname).toBe("/previews/s/clinic-abc");
  });

  it.each([
    ["missing", null],
    ["another host", "https://evil.example/s/clinic-abc"],
    ["http downgrade", "http://preview.pitchmyweb.com/s/clinic-abc"],
    ["another port", "https://preview.pitchmyweb.com:8443/s/clinic-abc"],
    ["internal address", "http://169.254.169.254/latest/meta-data"],
    ["credentials", "https://user:pw@preview.pitchmyweb.com/s/clinic-abc"],
    ["query string", "https://preview.pitchmyweb.com/s/clinic-abc?next=http://evil"],
    ["other path", "https://preview.pitchmyweb.com/admin"],
    ["nested path", "https://preview.pitchmyweb.com/s/clinic-abc/video"],
    ["traversal", "https://preview.pitchmyweb.com/s/../../etc/passwd"],
    ["not a URL", "javascript:alert(1)"],
  ])("rejects %s", (_label, candidate) => {
    expect(() => assertPreviewUrl(candidate, SITES)).toThrow(UrlNotAllowedError);
  });
});
