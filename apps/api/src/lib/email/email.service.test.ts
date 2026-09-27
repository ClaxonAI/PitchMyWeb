import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureEvents } from "../observability/events";
import type { EmailConfigResult } from "./config";
import { resetEmailReportingForTesting, sendEmail, type SendEmailInput } from "./email.service";
import type { EmailTransport, TransportResult } from "./transport";

const API_KEY = "test-resend-key-not-real-0123456789";
const RECIPIENT = "buyer@example.com";
const config: EmailConfigResult = { ok: true, config: { apiKey: API_KEY, from: "PitchMyWeb <no-reply@pitchmyweb.in>", replyTo: "support@claxonai.in" } };

const input: SendEmailInput = {
  to: RECIPIENT,
  category: "payment_receipt",
  content: { subject: "Payment received", html: "<p>Thanks</p>", text: "Thanks" },
  idempotencyKey: "order-receipt/order_1",
  referenceId: "order_1",
  userId: "user_1",
};

function transportReturning(...results: TransportResult[]) {
  return vi.fn<EmailTransport>(async () => results.shift() ?? { error: { name: "application_error", statusCode: 500 } });
}

const noSleep = async () => {};
let events: Record<string, unknown>[] = [];
let restore: () => void;

beforeEach(() => {
  events = [];
  restore = captureEvents((entry) => events.push(entry));
  resetEmailReportingForTesting();
});
afterEach(() => restore());

describe("sendEmail", () => {
  it("sends from the configured sender, with the reply-to, tag and idempotency key", async () => {
    const transport = transportReturning({ id: "email_123" });
    const result = await sendEmail(input, { config, transport, sleep: noSleep });

    expect(result).toEqual({ status: "sent", id: "email_123", attempts: 1 });
    expect(transport).toHaveBeenCalledOnce();
    const [email, options] = transport.mock.calls[0]!;
    expect(email).toEqual({
      from: "PitchMyWeb <no-reply@pitchmyweb.in>",
      to: RECIPIENT,
      replyTo: "support@claxonai.in",
      subject: "Payment received",
      html: "<p>Thanks</p>",
      text: "Thanks",
      tags: [{ name: "category", value: "payment_receipt" }],
    });
    expect(options).toEqual({ idempotencyKey: "order-receipt/order_1" });
    expect(events).toMatchObject([{ event: "email.sent", emailId: "email_123", category: "payment_receipt", referenceId: "order_1", attempts: 1 }]);
  });

  it("leaves reply-to out when none is configured", async () => {
    const transport = transportReturning({ id: "email_1" });
    const noReplyTo: EmailConfigResult = { ok: true, config: { apiKey: API_KEY, from: "PitchMyWeb <no-reply@pitchmyweb.in>", replyTo: null } };
    await sendEmail(input, { config: noReplyTo, transport, sleep: noSleep });
    expect(transport.mock.calls[0]![0].replyTo).toBeNull();
  });

  it("retries a transient failure and reports the send that went through", async () => {
    const transport = transportReturning({ error: { name: "rate_limit_exceeded", statusCode: 429 } }, { id: "email_2" });
    const sleep = vi.fn(noSleep);
    const result = await sendEmail(input, { config, transport, sleep });

    expect(result).toEqual({ status: "sent", id: "email_2", attempts: 2 });
    expect(sleep).toHaveBeenCalledWith(500);
    // Same key on the retry, so Resend cannot send it twice.
    expect(transport.mock.calls.map(([, options]) => options.idempotencyKey)).toEqual(["order-receipt/order_1", "order-receipt/order_1"]);
  });

  it("gives up after three attempts at a transient failure, as retryable", async () => {
    const transport = transportReturning(
      { error: { name: "internal_server_error", statusCode: 500 } },
      { error: { name: "internal_server_error", statusCode: 500 } },
      { error: { name: "internal_server_error", statusCode: 500 } },
    );
    const result = await sendEmail(input, { config, transport, sleep: noSleep });

    expect(result).toEqual({ status: "failed", reason: "internal_server_error", retryable: true, attempts: 3 });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(events.at(-1)).toMatchObject({ event: "email.failed", level: "error", error: "internal_server_error", statusCode: 500, retryable: true });
  });

  it("does not retry a permanent failure", async () => {
    const transport = transportReturning({ error: { name: "validation_error", statusCode: 422 } });
    const result = await sendEmail(input, { config, transport, sleep: noSleep });

    expect(result).toEqual({ status: "failed", reason: "validation_error", retryable: false, attempts: 1 });
    expect(transport).toHaveBeenCalledOnce();
  });

  it("treats a thrown transport error as transient", async () => {
    const transport = vi.fn<EmailTransport>().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce({ id: "email_3" });
    expect(await sendEmail(input, { config, transport, sleep: noSleep })).toEqual({ status: "sent", id: "email_3", attempts: 2 });
  });

  it("skips without calling Resend when email is not configured, and says so once", async () => {
    const transport = transportReturning({ id: "never" });
    const notConfigured: EmailConfigResult = { ok: false, reason: "not_configured" };

    expect(await sendEmail(input, { config: notConfigured, transport })).toEqual({ status: "skipped", reason: "not_configured" });
    expect(await sendEmail(input, { config: notConfigured, transport })).toEqual({ status: "skipped", reason: "not_configured" });
    expect(transport).not.toHaveBeenCalled();
    expect(events.filter((entry) => entry.event === "email.skipped")).toHaveLength(1);
  });

  it("refuses an invalid recipient without calling Resend", async () => {
    const transport = transportReturning({ id: "never" });
    for (const to of ["", "not-an-email", "a@b", "two@example.com, three@example.com"]) {
      expect(await sendEmail({ ...input, to }, { config, transport })).toMatchObject({ status: "failed", reason: "invalid_recipient", retryable: false });
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it("refuses empty content", async () => {
    const transport = transportReturning({ id: "never" });
    const result = await sendEmail({ ...input, content: { ...input.content, text: " " } }, { config, transport });
    expect(result).toMatchObject({ status: "failed", reason: "invalid_content" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("alerts on a configuration problem such as a bad key", async () => {
    const transport = transportReturning({ error: { name: "invalid_api_key", statusCode: 403 } });
    await sendEmail(input, { config, transport, sleep: noSleep });
    expect(events.at(-1)).toMatchObject({ event: "email.failed", error: "invalid_api_key", retryable: false });
  });

  it("names an error Resend gave no code by its status, and logs its message without addresses", async () => {
    const transport = transportReturning({ error: { name: undefined, statusCode: 400, message: `Could not send to ${RECIPIENT}: domain is being verified` } });
    const result = await sendEmail(input, { config, transport, sleep: noSleep });
    expect(result).toEqual({ status: "failed", reason: "http_400", retryable: false, attempts: 1 });
    expect(events.at(-1)).toMatchObject({ event: "email.failed", error: "http_400", statusCode: 400, detail: "Could not send to <address>: domain is being verified" });
    expect(JSON.stringify(events)).not.toContain(RECIPIENT);
  });

  it("never logs the recipient, the content or the API key", async () => {
    await sendEmail(input, { config, transport: transportReturning({ id: "email_4" }), sleep: noSleep });
    await sendEmail(input, { config, transport: transportReturning({ error: { name: "validation_error", statusCode: 422 } }), sleep: noSleep });
    await sendEmail({ ...input, to: "bad" }, { config, transport: transportReturning({ id: "x" }) });
    const logged = JSON.stringify(events);
    expect(logged).not.toContain(RECIPIENT);
    expect(logged).not.toContain("bad");
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain("Payment received");
    expect(logged).not.toContain("Thanks");
  });
});
