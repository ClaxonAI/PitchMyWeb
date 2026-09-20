import { z } from "zod";

// Job payloads are validated on both ends: the API parses before enqueueing
// so a malformed job never reaches Redis, and the worker parses on receipt
// so a job written by an older/newer deploy fails loudly instead of being
// half-interpreted.

export const sessionCommandTypeSchema = z.enum(["connect", "pairing-code", "disconnect"]);
export type SessionCommandType = z.infer<typeof sessionCommandTypeSchema>;

export const sessionCommandSchema = z
  .object({
    type: sessionCommandTypeSchema,
    accountId: z.string().min(1),
    // Digits only, no "+" and no separators — the same normalized form
    // WhatsApp's own pairing-code API expects.
    phoneNumber: z
      .string()
      .regex(/^\d{8,15}$/)
      .optional(),
  })
  .refine((command) => command.type !== "pairing-code" || command.phoneNumber !== undefined, {
    message: "phoneNumber is required for a pairing-code command",
    path: ["phoneNumber"],
  });
export type SessionCommand = z.infer<typeof sessionCommandSchema>;

// Only the id: the message row is the source of truth for recipient and
// body, so a queued job can never disagree with the database, and a body
// never sits in Redis in plaintext.
export const sendJobSchema = z.object({
  messageId: z.string().min(1),
});
export type SendJob = z.infer<typeof sendJobSchema>;

export const reconnectJobSchema = z.object({
  accountId: z.string().min(1),
  attempt: z.number().int().min(1),
});
export type ReconnectJob = z.infer<typeof reconnectJobSchema>;

// Only the id, same reasoning as SendJob: the DemoRecording row (and its
// website project) is the source of truth for what to record.
export const recordingJobSchema = z.object({
  recordingId: z.string().min(1),
});
export type RecordingJob = z.infer<typeof recordingJobSchema>;

// Only the id, same reasoning as RecordingJob: the CampaignExecution row
// (and its parent Campaign) is the source of truth for what to search.
export const discoveryJobSchema = z.object({
  executionId: z.string().min(1),
});
export type DiscoveryJob = z.infer<typeof discoveryJobSchema>;

// Only the id, same reasoning as DiscoveryJob: the Business row (its
// `website` column) is the source of truth for what to check.
export const websiteVerificationJobSchema = z.object({
  businessId: z.string().min(1),
});
export type WebsiteVerificationJob = z.infer<typeof websiteVerificationJobSchema>;
