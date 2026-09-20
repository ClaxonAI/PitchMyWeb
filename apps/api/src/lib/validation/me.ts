import { z } from "zod";

// PATCH /api/me: the only field a user may change about their own account
// through this endpoint is `name` — email changes and password changes each
// have their own dedicated flow (the latter below), never bundled into a
// generic "update profile" body. `.strict()` so no other field (email,
// passwordHash, id, ...) can be smuggled through, same convention as every
// other PATCH schema in this codebase.
export const meUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();

export type MeUpdateInput = z.infer<typeof meUpdateSchema>;

// POST /api/me/password. newPassword uses the same minimum length as
// registerSchema (lib/validation/auth.ts) — kept in sync deliberately, not
// duplicated by accident.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "current password is required"),
    newPassword: z.string().min(8, "password must be at least 8 characters"),
  })
  .strict();

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
