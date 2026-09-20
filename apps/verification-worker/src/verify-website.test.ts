import { describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright";
import { verifyWebsite } from "./verify-website";
import { SsrfSafeFetchError, type ConnectParams, type ConnectResult, type ResolvedAddress } from "./ssrf-safe-fetch";
import { Readable } from "node:stream";

const PUBLIC: ResolvedAddress[] = [{ address: "93.184.216.34", family: 4 }];

function resolveHost() {
  return vi.fn(async (): Promise<ResolvedAddress[]> => PUBLIC);
}

function textBody(text: string): NodeJS.ReadableStream {
  return Readable.from([Buffer.from(text)]);
}

/** A fake Browser whose newContext()/newPage() return controllable stubs. */
function fakeBrowser(page: {
  goto: (url: string, opts: unknown) => Promise<{ ok: () => boolean } | null>;
  content?: () => Promise<string>;
  innerText?: string;
}): { browser: Browser; newContext: ReturnType<typeof vi.fn> } {
  const fakePage = {
    goto: vi.fn(page.goto),
    evaluate: vi.fn(async () => page.innerText ?? ""),
    content: vi.fn(page.content ?? (async () => "")),
  };
  const context = { newPage: vi.fn(async () => fakePage), close: vi.fn(async () => undefined) };
  const newContext = vi.fn(async () => context);
  return { browser: { newContext } as unknown as Browser, newContext };
}

describe("verifyWebsite", () => {
  it("returns DEAD for an unparseable URL, without making any request", async () => {
    const { browser, newContext } = fakeBrowser({ goto: async () => ({ ok: () => true }) });
    const status = await verifyWebsite("not a url", { browser });
    expect(status).toBe("DEAD");
    expect(newContext).not.toHaveBeenCalled();
  });

  it("returns DEAD for a non-http(s) protocol", async () => {
    const { browser } = fakeBrowser({ goto: async () => ({ ok: () => true }) });
    expect(await verifyWebsite("ftp://example.com/", { browser })).toBe("DEAD");
  });

  it("returns LIVE on a clean 200 HEAD response, without escalating to Playwright", async () => {
    const { browser, newContext } = fakeBrowser({ goto: async () => ({ ok: () => true }) });
    const connect = vi.fn(async (): Promise<ConnectResult> => ({ status: 200, headers: {}, body: textBody("<html>Welcome to Acme Dental</html>") }));

    const status = await verifyWebsite("https://acme-dental.example/", { browser, fetchOptions: { resolveHost: resolveHost(), connect } });

    expect(status).toBe("LIVE");
    expect(newContext).not.toHaveBeenCalled();
  });

  it("returns UNREACHABLE on a bare timeout, without retrying via GET or escalating", async () => {
    const { browser, newContext } = fakeBrowser({ goto: async () => ({ ok: () => true }) });
    const connect = vi.fn(async () => {
      throw new SsrfSafeFetchError("timeout", "timed out");
    });

    const status = await verifyWebsite("https://slow.example/", { browser, fetchOptions: { resolveHost: resolveHost(), connect } });

    expect(status).toBe("UNREACHABLE");
    expect(connect).toHaveBeenCalledTimes(1);
    expect(newContext).not.toHaveBeenCalled();
  });

  it("retries with GET when HEAD returns 405, and returns LIVE if that succeeds clean", async () => {
    const { browser } = fakeBrowser({ goto: async () => ({ ok: () => true }) });
    const connect = vi.fn(async (params: ConnectParams): Promise<ConnectResult> => {
      if (params.method === "HEAD") return { status: 405, headers: {}, body: textBody("") };
      return { status: 200, headers: {}, body: textBody("Real content here") };
    });

    const status = await verifyWebsite("https://head-hostile.example/", { browser, fetchOptions: { resolveHost: resolveHost(), connect } });

    expect(status).toBe("LIVE");
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("returns DEAD when both HEAD and the GET fallback fail outright", async () => {
    const { browser } = fakeBrowser({ goto: async () => ({ ok: () => true }) });
    const connect = vi.fn(async () => {
      throw new SsrfSafeFetchError("connection_failed", "refused");
    });

    const status = await verifyWebsite("https://down.example/", { browser, fetchOptions: { resolveHost: resolveHost(), connect } });

    expect(status).toBe("DEAD");
  });

  it("returns DEAD on a private-address rejection (SSRF guard tripped)", async () => {
    const { browser } = fakeBrowser({ goto: async () => ({ ok: () => true }) });
    const connect = vi.fn(async () => {
      throw new SsrfSafeFetchError("private_address", "nope");
    });

    expect(await verifyWebsite("https://sneaky.example/", { browser, fetchOptions: { resolveHost: resolveHost(), connect } })).toBe("DEAD");
  });

  it("escalates to Playwright on a parked-page signal in the raw HTML, and returns LIVE when the render looks real", async () => {
    const { browser, newContext } = fakeBrowser({
      goto: async () => ({ ok: () => true }),
      content: async () => "<html><body>A real business that mentions buying a domain in an FAQ, but is otherwise a normal site with lots of content describing services.</body></html>",
      innerText: "A real business that mentions buying a domain in an FAQ, but is otherwise a normal site with lots of content.",
    });
    const connect = vi.fn(async (): Promise<ConnectResult> => ({ status: 200, headers: {}, body: textBody("this domain is parked, buy this domain today") }));

    const status = await verifyWebsite("https://ambiguous.example/", { browser, fetchOptions: { resolveHost: resolveHost(), connect } });

    expect(status).toBe("LIVE");
    expect(newContext).toHaveBeenCalledTimes(1);
  });

  it("escalates to Playwright and returns PARKED when the rendered page still matches a parked signal", async () => {
    const { browser } = fakeBrowser({
      goto: async () => ({ ok: () => true }),
      content: async () => "<html>This domain is parked free, courtesy of GoDaddy.com/domains</html>",
      innerText: "This domain is parked",
    });
    const connect = vi.fn(async (): Promise<ConnectResult> => ({ status: 200, headers: {}, body: textBody("this domain is parked") }));

    expect(await verifyWebsite("https://parked.example/", { browser, fetchOptions: { resolveHost: resolveHost(), connect } })).toBe("PARKED");
  });

  it("escalates to Playwright and returns PARKED when the rendered body is near-empty", async () => {
    const { browser } = fakeBrowser({ goto: async () => ({ ok: () => true }), content: async () => "<html></html>", innerText: "  " });
    const connect = vi.fn(async (): Promise<ConnectResult> => ({ status: 200, headers: {}, body: textBody("buy this domain") }));

    expect(await verifyWebsite("https://empty.example/", { browser, fetchOptions: { resolveHost: resolveHost(), connect } })).toBe("PARKED");
  });

  it("returns UNREACHABLE (not DEAD) when Playwright navigation fails after a successful HTTP check", async () => {
    const { browser } = fakeBrowser({
      goto: async () => {
        throw new Error("net::ERR_CONNECTION_RESET");
      },
    });
    const connect = vi.fn(async (): Promise<ConnectResult> => ({ status: 200, headers: {}, body: textBody("this domain is parked") }));

    expect(await verifyWebsite("https://flaky.example/", { browser, fetchOptions: { resolveHost: resolveHost(), connect } })).toBe("UNREACHABLE");
  });

  it("returns UNREACHABLE when Playwright's navigation response is not ok", async () => {
    const { browser } = fakeBrowser({ goto: async () => ({ ok: () => false }) });
    const connect = vi.fn(async (): Promise<ConnectResult> => ({ status: 200, headers: {}, body: textBody("this domain is parked") }));

    expect(await verifyWebsite("https://not-ok.example/", { browser, fetchOptions: { resolveHost: resolveHost(), connect } })).toBe("UNREACHABLE");
  });
});
