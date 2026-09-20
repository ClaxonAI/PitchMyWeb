import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpRazorpayClient, createRazorpayClientFromEnv } from "./razorpay-client";
import { PaymentConfigurationError, PaymentGatewayError } from "../errors";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("createRazorpayClientFromEnv", () => {
  it("throws PaymentConfigurationError when RAZORPAY_KEY_ID is missing", () => {
    process.env.RAZORPAY_KEY_ID = "";
    process.env.RAZORPAY_KEY_SECRET = "secret";
    expect(() => createRazorpayClientFromEnv()).toThrow(PaymentConfigurationError);
  });

  it("throws PaymentConfigurationError when RAZORPAY_KEY_SECRET is missing", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_x";
    process.env.RAZORPAY_KEY_SECRET = "";
    expect(() => createRazorpayClientFromEnv()).toThrow(PaymentConfigurationError);
  });

  it("returns a client when both are configured", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_x";
    process.env.RAZORPAY_KEY_SECRET = "secret";
    expect(() => createRazorpayClientFromEnv()).not.toThrow();
  });
});

describe("HttpRazorpayClient", () => {
  it("authenticates with HTTP Basic auth built from key_id:key_secret, never sending the secret any other way", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.razorpay.com/v1/orders");
      const headers = init.headers as Record<string, string>;
      expect(headers.authorization).toBe(`Basic ${Buffer.from("rzp_test_x:secret").toString("base64")}`);
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ amount: 500, currency: "USD", receipt: "order-1" });
      return new Response(JSON.stringify({ id: "order_abc", amount: 500, currency: "USD" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpRazorpayClient("rzp_test_x", "secret");
    const result = await client.createOrder({ amount: 500, currency: "USD", receipt: "order-1" });
    expect(result).toEqual({ id: "order_abc", amount: 500, currency: "USD" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws PaymentGatewayError (never the raw Razorpay error body) on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { description: "leaked internal detail" } }), { status: 401 })),
    );
    const client = new HttpRazorpayClient("rzp_test_x", "wrong_secret");
    await expect(client.createOrder({ amount: 500, currency: "USD", receipt: "order-1" })).rejects.toThrow(PaymentGatewayError);
  });

  it("throws PaymentGatewayError on a connection failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const client = new HttpRazorpayClient("rzp_test_x", "secret");
    await expect(client.createOrder({ amount: 500, currency: "USD", receipt: "order-1" })).rejects.toThrow(PaymentGatewayError);
  });

  it("throws PaymentGatewayError on timeout without hanging the test", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }),
    );
    const client = new HttpRazorpayClient("rzp_test_x", "secret", 20);
    await expect(client.createOrder({ amount: 500, currency: "USD", receipt: "order-1" })).rejects.toThrow(PaymentGatewayError);
  });
});
