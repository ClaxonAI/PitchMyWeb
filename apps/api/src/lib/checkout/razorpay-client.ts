import { PaymentConfigurationError, PaymentGatewayError } from "../errors";

// Razorpay Standard Checkout, called directly over its REST API (no SDK
// dependency) — the same hand-rolled-fetch-client shape already used for
// Ollama (lib/ai/ollama-client.ts) and object storage, rather than adding a
// vendor SDK for what is, server-side, one POST call. `RazorpayClient` is
// the abstraction lib/checkout/checkout.service.ts depends on: production
// wiring uses HttpRazorpayClient, tests inject a fake (section 17's
// established pattern — never a real network call in a test).

export type CreateRazorpayOrderInput = {
  /** Smallest currency unit (cents for USD, paise for INR). */
  amount: number;
  currency: string;
  /** Our local Order.id — lets a Razorpay dashboard entry be traced back here. */
  receipt: string;
};

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
};

export interface RazorpayClient {
  createOrder(input: CreateRazorpayOrderInput): Promise<RazorpayOrder>;
}

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
const DEFAULT_TIMEOUT_MS = 15_000;

export class HttpRazorpayClient implements RazorpayClient {
  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async createOrder(input: CreateRazorpayOrderInput): Promise<RazorpayOrder> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Razorpay authenticates server-side API calls with HTTP Basic
          // Auth (key_id:key_secret) — this is the one place the secret is
          // ever used, and it never leaves this process.
          authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        },
        body: JSON.stringify({
          amount: input.amount,
          currency: input.currency,
          receipt: input.receipt,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Razorpay's error body can contain request-echoing detail; never
        // forward it to our client (section 19 precedent) — log it here and
        // return a fixed, sanitized message instead.
        const detail = await response.text().catch(() => "");
        console.error(`Razorpay order creation failed (${response.status}): ${detail}`);
        throw new PaymentGatewayError();
      }

      const body = (await response.json()) as { id: string; amount: number; currency: string };
      return { id: body.id, amount: body.amount, currency: body.currency };
    } catch (error) {
      if (error instanceof PaymentGatewayError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`Razorpay order creation timed out after ${this.timeoutMs}ms`);
      } else {
        console.error("Razorpay order creation failed:", error);
      }
      throw new PaymentGatewayError();
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Builds a real Razorpay client from environment configuration. Called
 * lazily (inside the route handler's request path, not at module load), so
 * a missing configuration surfaces as a normal caught PaymentConfigurationError
 * (503) rather than crashing the process at startup or import time.
 */
export function createRazorpayClientFromEnv(): RazorpayClient {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new PaymentConfigurationError("Payments are not configured: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must both be set.");
  }
  return new HttpRazorpayClient(keyId, keySecret);
}
