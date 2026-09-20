// The four BullMQ queues that connect apps/api (producer) to
// apps/whatsapp-worker (consumer). Queue names are part of the wire
// contract — a rename here is a breaking change for any job already
// sitting in Redis, so they live in one place both sides import.

export const QUEUE_SESSION = "whatsapp-session";
export const QUEUE_SEND = "whatsapp-send";
export const QUEUE_RECONNECT = "whatsapp-reconnect";
export const QUEUE_EVENTS = "whatsapp-events";

// apps/api (producer) -> apps/recorder-worker (consumer): record a published
// preview site with Playwright and upload the MP4. Uses the same
// queuePrefix() as the WhatsApp queues so test runs stay isolated.
export const QUEUE_RECORDING = "website-recording";

// apps/api (producer) -> apps/discovery-worker (consumer): run a business-
// discovery search (OSM/Overpass, Phase 2's OsmLeadProvider) for one
// campaign execution.
export const QUEUE_DISCOVERY = "business-discovery";

// apps/api (producer) -> apps/verification-worker (consumer): check one
// Business's website liveness (Phase 2C). Enqueued in batches by a periodic
// job, not per-campaign-execution like the queues above.
export const QUEUE_WEBSITE_VERIFICATION = "website-verification";

export const QUEUE_NAMES = [QUEUE_SESSION, QUEUE_SEND, QUEUE_RECONNECT, QUEUE_EVENTS, QUEUE_RECORDING, QUEUE_DISCOVERY, QUEUE_WEBSITE_VERIFICATION] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/**
 * The Redis key prefix BullMQ namespaces every queue under.
 *
 * It exists so a test run can be isolated from a running worker. The api
 * suite enqueues real jobs to prove the producer works; without a separate
 * prefix, a worker attached to the same Redis picks those jobs up and acts
 * on them — opening real WhatsApp sockets for throwaway test accounts. Both
 * sides read the same variable, so setting WA_QUEUE_PREFIX in the test
 * environment is enough to keep the two apart.
 */
export function queuePrefix(): string {
  return process.env["WA_QUEUE_PREFIX"] ?? "bull";
}
