import { z } from "zod";

// Phase 4 auth endpoints. Not named in backend_tasks.md's endpoint list
// (section 23/24) but required to obtain the session every other endpoint
// depends on (section 4) — see the Phase 4 final report for this documented
// assumption.
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "password must be at least 8 characters"),
  // Set when /register was reached via a post-payment redirect from
  // /pricing (lib/checkout/checkout.service.ts's claimOrder attaches it to
  // the new account if it's a PAID, unclaimed order — silently ignored
  // otherwise). Optional: registering with no prior purchase is the normal case.
  orderId: z.string().min(1).optional(),
  fingerprintId: z.string().trim().min(8).max(512).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "password is required"),
  // Same as registerSchema's orderId, for a buyer who already had an
  // account and chose to log in instead of registering after paying.
  orderId: z.string().min(1).optional(),
  fingerprintId: z.string().trim().min(8).max(512).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
