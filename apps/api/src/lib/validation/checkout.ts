import { z } from "zod";

export const planIdSchema = z.enum(["auto", "direct"]);
export const marketSchema = z.enum(["india", "foreign"]);

export const createOrderSchema = z
  .object({
    planId: planIdSchema,
    market: marketSchema,
    // ISO 3166-1 alpha-2 (matches apps/web/src/data/countries.ts's `code`).
    // Display-only server-side today (amount depends only on market), kept
    // for the Order record so a later per-country price can be added
    // without a schema change.
    countryCode: z.string().trim().toUpperCase().length(2).optional(),
    couponCode: z.string().trim().toUpperCase().min(1).max(40).optional(),
  })
  .strict();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const verifyPaymentSchema = z
  .object({
    // Our local Order.id, not Razorpay's — the route looks up the order by
    // this and uses *its stored* razorpayOrderId for the signature check,
    // so a client can't point verification at an order it doesn't own.
    orderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().min(1),
  })
  .strict();

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
