import { z } from "zod";
import { emitEvent } from "../observability/events";
import { readEmailConfig, type EmailConfigResult } from "./config";
import { resendTransport, type EmailTransport } from "./transport";

// Every transactional email the API sends goes through sendEmail: one place
// for the sender, the reply-to, retries and logging. Callers bring rendered
// content (templates/) and a category; they never touch Resend themselves.
//
// Logged per send: category, Resend's email id, attempts, the error code and
// the caller's reference (an order id). Never the recipient, the subject or
// body, or anything from the API key.

export type EmailCategory = "payment_receipt" | "welcome" | "password_reset_code" | "password_changed";

export type RenderedEmail = { subject: string; html: string; text: string };

export type SendEmailInput = {
  to: string;
  category: EmailCategory;
  content: RenderedEmail;
  /** Resend drops a repeat of the same key within 24 hours, so retries never send twice. */
  idempotencyKey?: string;
  /** Internal ids for the log line, e.g. the order the email is about. */
  referenceId?: string;
  userId?: string | null;
};

export type SkipReason = "not_configured" | "invalid_from" | "invalid_reply_to" | "test_sender_in_production";

export type SendEmailResult =
  | { status: "sent"; id: string; attempts: number }
  | { status: "skipped"; reason: SkipReason }
  | { status: "failed"; reason: string; retryable: boolean; attempts: number };

export type SendEmailDeps = {
  config?: EmailConfigResult;
  transport?: EmailTransport;
  sleep?: (ms: number) => Promise<void>;
};

// Three attempts, a short pause between each: enough to ride out a rate
// limit or a blip without holding anything up for long. Nothing is retried
// forever; a caller that needs another go (order-receipt.ts) tries again on
// its own next trigger, and Resend's idempotency key keeps that from
// duplicating a send that did in fact go through.
const RETRY_DELAYS_MS = [500, 2000];

// Worth another attempt: the request may well succeed a moment later.
const TRANSIENT = new Set(["rate_limit_exceeded", "application_error", "internal_server_error", "concurrent_idempotent_requests"]);
// Our configuration is wrong, not the one email: page someone.
const NEEDS_ATTENTION = new Set(["invalid_api_key", "missing_api_key", "restricted_api_key", "invalid_from_address", "daily_quota_exceeded", "monthly_quota_exceeded", "invalid_access", "security_error"]);

const recipientSchema = z.string().trim().toLowerCase().email().max(254);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resend's error message, safe to log: any email address in it replaced and
 * the length capped. Without it a failure logged only as "400" (a send made
 * while Resend was re-verifying the domain) could not be told apart from a
 * real problem.
 */
export function scrubErrorMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.replace(/[^\s@<>"'`:;,()]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<address>").slice(0, 200);
}

let reportedUnconfigured = false;

/**
 * Logs an email that was not sent because email is not (correctly)
 * configured. "Not configured" is reported once per process: a development
 * machine without a key would otherwise log it on every checkout. In
 * production any of these is an alert — customers are not getting mail.
 */
export function reportEmailSkipped(category: EmailCategory, reason: SkipReason, fields: Record<string, string | undefined> = {}): void {
  if (reason === "not_configured") {
    if (reportedUnconfigured) return;
    reportedUnconfigured = true;
  }
  const production = process.env.APP_ENV?.trim().toLowerCase() === "production";
  emitEvent("email.skipped", { ...fields, category, reason }, { level: production ? "error" : "warn", alert: production });
}

export async function sendEmail(input: SendEmailInput, deps: SendEmailDeps = {}): Promise<SendEmailResult> {
  const fields = { category: input.category, referenceId: input.referenceId, userId: input.userId ?? undefined };

  const configResult = deps.config ?? readEmailConfig();
  if (!configResult.ok) {
    reportEmailSkipped(input.category, configResult.reason, { referenceId: input.referenceId });
    return { status: "skipped", reason: configResult.reason };
  }
  const { config } = configResult;

  const recipient = recipientSchema.safeParse(input.to);
  if (!recipient.success || !input.content.subject.trim() || !input.content.html.trim() || !input.content.text.trim()) {
    const reason = recipient.success ? "invalid_content" : "invalid_recipient";
    emitEvent("email.failed", { ...fields, error: reason, retryable: false, attempts: 0 }, { level: "error" });
    return { status: "failed", reason, retryable: false, attempts: 0 };
  }

  const transport = deps.transport ?? resendTransport(config.apiKey);
  const sleep = deps.sleep ?? defaultSleep;
  const email = {
    from: config.from,
    to: recipient.data,
    replyTo: config.replyTo,
    subject: input.content.subject,
    html: input.content.html,
    text: input.content.text,
    tags: [{ name: "category", value: input.category }],
  };

  let attempts = 0;
  for (;;) {
    attempts += 1;
    let result;
    try {
      result = await transport(email, { idempotencyKey: input.idempotencyKey });
    } catch {
      // The SDK reports network trouble as an error result; a throw means
      // something below it failed, which is just as worth another try.
      result = { error: { name: "application_error", statusCode: null } };
    }

    if ("id" in result) {
      emitEvent("email.sent", { ...fields, emailId: result.id, attempts });
      return { status: "sent", id: result.id, attempts };
    }

    const { statusCode } = result.error;
    // Resend has answered without an error code; name it by its status.
    const name = result.error.name || `http_${statusCode ?? "unknown"}`;
    const retryable = TRANSIENT.has(name);
    if (retryable && attempts <= RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempts - 1]!);
      continue;
    }
    emitEvent("email.failed", { ...fields, error: name, statusCode, detail: scrubErrorMessage(result.error.message), retryable, attempts }, { level: "error", alert: NEEDS_ATTENTION.has(name) });
    return { status: "failed", reason: name, retryable, attempts };
  }
}

/** Tests only: report "not configured" again, as a fresh process would. */
export function resetEmailReportingForTesting(): void {
  reportedUnconfigured = false;
}
