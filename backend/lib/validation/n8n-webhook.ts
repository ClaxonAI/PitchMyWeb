import { z } from "zod";

// backend_tasks.md section 36. The doc does not specify an exact webhook
// payload shape, only requirements (authenticated, Zod-validated, verify
// referenced records exist, idempotent). This is the smallest reasonable
// generic envelope: a discriminated event type, an idempotency key so
// replayed deliveries are recognizable (section 37), and a free-form
// payload validated further per-event by the webhook handler (a future
// phase) once the referenced Campaign/Lead is confirmed to exist.
export const n8nWebhookEventSchema = z.enum([
  "CAMPAIGN_EXECUTION_STARTED",
  "CAMPAIGN_EXECUTION_COMPLETED",
  "CAMPAIGN_EXECUTION_FAILED",
  "LEAD_ENRICHMENT_COMPLETED",
]);

export type N8nWebhookEvent = z.infer<typeof n8nWebhookEventSchema>;

export const n8nWebhookEnvelopeSchema = z.object({
  event: n8nWebhookEventSchema,
  idempotencyKey: z.string().trim().min(1),
  campaignId: z.string().trim().min(1).optional(),
  leadId: z.string().trim().min(1).optional(),
  occurredAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type N8nWebhookEnvelope = z.infer<typeof n8nWebhookEnvelopeSchema>;
