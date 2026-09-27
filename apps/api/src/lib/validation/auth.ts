import { z } from "zod";

// Phase 4 auth endpoints. Not named in backend_tasks.md's endpoint list
// (section 23/24) but required to obtain the session every other endpoint
// depends on (section 4) — see the Phase 4 final report for this documented
// assumption.
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // bcrypt reads only the first 72 bytes; a longer limit would silently ignore the rest.
  password: z.string().min(8, "password must be at least 8 characters").max(72, "password must be at most 72 characters"),
  // Set when /register was reached via a post-payment redirect from
  // /pricing (lib/checkout/checkout.service.ts's claimOrder attaches it to
  // the new account if it's a PAID, unclaimed order — silently ignored
  // otherwise). Optional: registering with no prior purchase is the normal case.
  orderId: z.string().min(1).optional(),
  fingerprintId: z.string().trim().min(8).max(512).optional(),
  // Cloudflare Turnstile's token from the sign-up form (lib/auth/turnstile.ts).
  // Optional here so the check itself decides: it is required only while
  // TURNSTILE_SECRET_KEY is set. Cloudflare caps tokens at 2048 characters.
  turnstileToken: z.string().trim().min(1).max(2048).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "password is required").max(1024),
  // Same as registerSchema's orderId, for a buyer who already had an
  // account and chose to log in instead of registering after paying.
  orderId: z.string().min(1).optional(),
  fingerprintId: z.string().trim().min(8).max(512).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Password reset by emailed code (lib/auth/password-reset.ts).
export const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const passwordResetVerifySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
});

export const passwordResetCompleteSchema = z.object({
  resetToken: z.string().trim().min(20).max(200),
  password: z.string().min(8, "password must be at least 8 characters").max(72, "password must be at most 72 characters"),
});
