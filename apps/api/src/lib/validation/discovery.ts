import { z } from "zod";
import { businessProviderInputSchema } from "./business";

// POST /api/internal/pipeline/discovery-results — sent by
// apps/discovery-worker after it finishes (or fails) a search for one
// campaign execution. `businesses` is present on success; `error` is a
// fixed, sanitized failure reason string on failure — never both, never
// neither (see handleDiscoveryResults's own validation for that rule; zod's
// object schema alone can't express "exactly one of").
export const discoveryResultsSchema = z
  .object({
    executionId: z.string().min(1),
    businesses: z.array(businessProviderInputSchema).optional(),
    error: z.string().min(1).max(500).optional(),
  })
  .strict();

export type DiscoveryResultsInput = z.infer<typeof discoveryResultsSchema>;
