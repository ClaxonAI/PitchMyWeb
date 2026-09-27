import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function post(origin?: string, method = "POST") {
  return new NextRequest("http://localhost:4000/api/auth/login", { method, headers: origin ? { origin } : {} });
}

describe("proxy: cross-site request guard", () => {
  it("refuses a write from another site", () => {
    process.env.APP_URL = "https://pitchmyweb.in";
    expect(proxy(post("https://evil.example")).status).toBe(403);
    expect(proxy(post("null")).status).toBe(403);
    expect(proxy(post("https://evil.example", "DELETE")).status).toBe(403);
  });

  it("lets the web app, this API and non-browser callers through", () => {
    process.env.APP_URL = "https://pitchmyweb.in";
    expect(proxy(post("https://pitchmyweb.in")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(post("http://localhost:4000")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(post()).headers.get("x-middleware-next")).toBe("1");
  });

  it("never blocks reads", () => {
    expect(proxy(post("https://evil.example", "GET")).headers.get("x-middleware-next")).toBe("1");
  });
});
