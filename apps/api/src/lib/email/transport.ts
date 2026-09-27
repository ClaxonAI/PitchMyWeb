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

// Only the error's code and HTTP status come back. Resend's messages can
// quote the recipient's address, and they are never needed to decide what to do.
export type TransportResult = { id: string } | { error: { name: string; statusCode: number | null } };

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
    if (error) return { error: { name: error.name, statusCode: error.statusCode } };
    return { id: data.id };
  };
}
