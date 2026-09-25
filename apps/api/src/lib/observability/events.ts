// Structured operational events for the API.
//
// Every event is one JSON line on stdout/stderr, so any log platform
// (Datadog, Loki, CloudWatch, Vercel, Railway…) can filter and chart by
// `event` without parsing prose. Events marked `alert: true` are also sent
// to ALERT_WEBHOOK_URL when it is configured (Slack/Discord-compatible
// `{ text }` body).
//
// Rules: never put secrets, raw upstream error text, message bodies or
// credentials in `fields`. Ids, counts, statuses and fixed reason codes only.

export type OperationalEvent =
  | "lead_discovery.run_started"
  | "lead_discovery.run_completed"
  | "lead_discovery.run_failed"
  | "lead_discovery.trigger_failed"
  | "lead_discovery.delivery_processed"
  | "lead_discovery.webhook_rejected"
  | "lead_discovery.stale_runs_expired"
  | "lead_discovery.run_blocked"
  | "selection.completed"
  | "selection.failed"
  | "pipeline.stage_changed"
  | "pipeline.failed"
  | "pipeline.replaced"
  | "pipeline.held"
  | "campaign.sending_paused"
  | "campaign.sending_resumed"
  | "pipeline.sent"
  | "recording.finished"
  | "delivery.failed"
  | "preview.cleanup"
  | "website_verification.batch_enqueued"
  | "whatsapp.signed_out"
  | "credits.ledger_mismatch"
  | "credits.reconciled";

export type EventLevel = "info" | "warn" | "error";

export type EventFields = Record<string, string | number | boolean | null | undefined>;

type Sink = (line: string, level: EventLevel) => void;

const defaultSink: Sink = (line, level) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

let sink: Sink = defaultSink;

/** Test hook: capture emitted lines instead of printing them. Returns a restore function. */
export function captureEvents(capture: (entry: Record<string, unknown>) => void): () => void {
  const previous = sink;
  sink = (line) => capture(JSON.parse(line) as Record<string, unknown>);
  return () => {
    sink = previous;
  };
}

export type EmitOptions = {
  level?: EventLevel;
  /** Also notify ALERT_WEBHOOK_URL (fire-and-forget). */
  alert?: boolean;
};

export function emitEvent(event: OperationalEvent, fields: EventFields = {}, options: EmitOptions = {}): void {
  const level = options.level ?? "info";
  const entry = { ts: new Date().toISOString(), level, event, service: "api", ...fields };
  try {
    sink(JSON.stringify(entry), level);
  } catch {
    // Logging must never break a request.
  }
  if (options.alert) {
    void sendAlert(event, fields);
  }
}

const ALERT_TIMEOUT_MS = 3000;

function formatAlert(event: OperationalEvent, fields: EventFields): string {
  const details = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${value}`)
    .join(" · ");
  const environment = process.env.APP_ENV ?? process.env.NODE_ENV ?? "unknown";
  return `[PitchMyWeb ${environment}] ${event}${details ? ` — ${details}` : ""}`;
}

/**
 * Posts an alert to ALERT_WEBHOOK_URL. Never throws and never blocks the
 * caller for longer than ALERT_TIMEOUT_MS; a failing alert channel is
 * logged once per call and otherwise ignored.
 */
export async function sendAlert(event: OperationalEvent, fields: EventFields, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!url) return false;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: formatAlert(event, fields) }),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", event: "alert.delivery_failed", status: response.status }));
      return false;
    }
    return true;
  } catch {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", event: "alert.delivery_failed", status: null }));
    return false;
  }
}
