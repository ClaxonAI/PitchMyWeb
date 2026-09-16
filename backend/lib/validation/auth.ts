import { z } from "zod";

// Phase 4 auth endpoints. Not named in backend_tasks.md's endpoint list
// (section 23/24) but required to obtain the session every other endpoint
// depends on (section 4) — see the Phase 4 final report for this documented
// assumption.
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "password must be at least 8 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
