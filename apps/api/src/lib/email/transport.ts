import { Resend } from "resend";

// The one place the Resend SDK is called. Everything else goes through
// email.service.ts, which takes a transport so tests never reach the network.

export type OutgoingEmail = {
  from: string;
  to: string;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
  tags: Array<{ name: string; value: string }>;
};

// The error's code, HTTP status and message. The message can quote the
// recipient's address, so email.service.ts scrubs it before logging it.
export type TransportResult = { id: string } | { error: { name: string | undefined; statusCode: number | null; message?: string } };

export type EmailTransport = (email: OutgoingEmail, options: { idempotencyKey?: string }) => Promise<TransportResult>;

export function resendTransport(apiKey: string): EmailTransport {
  const client = new Resend(apiKey);
  return async (email, { idempotencyKey }) => {
    const { data, error } = await client.emails.send(
      {
        from: email.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: email.tags,
        ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    if (error) return { error: { name: error.name, statusCode: error.statusCode, message: error.message } };
    return { id: data.id };
  };
}
