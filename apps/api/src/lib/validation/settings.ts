import { z } from "zod";

// backend_tasks.md section 19: "Do not put secrets into ordinary settings
// records." This is a best-effort guard against operators accidentally
// storing a credential-shaped value here — it is not a substitute for
// keeping real secrets in environment variables. Exported so
// lib/settings/settings.service.ts can apply the identical rule
// defensively on the read side (GET /api/settings, section 35: "without
// exposing secrets") instead of duplicating the pattern.
export const SECRET_LOOKING_KEY = /secret|password|apikey|api_key|token|credential/i;

export const settingsUpsertSchema = z
  .object({
    key: z.string().trim().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
    description: z.string().trim().min(1).optional(),
  })
  .refine((input) => !SECRET_LOOKING_KEY.test(input.key), {
    message: "Settings keys must not look like secrets; use environment variables instead",
    path: ["key"],
  });

export type SettingsUpsertInput = z.infer<typeof settingsUpsertSchema>;
