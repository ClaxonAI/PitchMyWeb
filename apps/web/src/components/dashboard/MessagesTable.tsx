"use client";

import { cn } from "@/lib/utils";
import type { WaMessageStatus, WhatsAppMessage } from "@/lib/api-client";

const TONE: Record<WaMessageStatus, string> = {
  QUEUED: "bg-ink/5 text-ink/60",
  SENDING: "bg-primary/10 text-primary",
  SENT: "bg-whatsapp/12 text-[#0a7a3c]",
  DELIVERED: "bg-whatsapp/15 text-[#0a7a3c]",
  READ: "bg-whatsapp/20 text-[#0a7a3c]",
  FAILED: "bg-coral/12 text-[#c2412f]",
  BLOCKED: "bg-coral/12 text-[#c2412f]",
  CANCELLED: "bg-ink/5 text-ink/60",
};

// `failureReason` holds a policy reason code for BLOCKED rows. Codes are
// deliberately stored rather than sentences (they are stable, and the
// worker writes them without knowing the UI language), so the sentence is
// assembled here.
const BLOCKED_REASONS: Record<string, string> = {
  opted_out: "Opted out",
  not_connected: "Not connected",
  invalid_number: "Not on WhatsApp",
  recent_duplicate: "Messaged recently",
  claimed_elsewhere: "Taken by another user",
  rate_limited: "Rate limited",
};

function describe(message: WhatsAppMessage): string {
  if (!message.failureReason) return "";
  return BLOCKED_REASONS[message.failureReason] ?? message.failureReason;
}

function time(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessagesTable({ messages }: { messages: WhatsAppMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-ink/12 bg-white px-5 py-10 text-center">
        <p className="text-[13px] text-ink/60">Nothing sent yet. Your messages and their delivery status will show up here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-ink/8 bg-white">
      <div className="border-b border-ink/6 px-5 py-3.5">
        <p className="text-[13px] font-semibold">Messages</p>
      </div>
      {/* Tables are the one thing allowed to scroll sideways on a phone;
          everything else in this page stacks instead. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="border-b border-ink/6 text-[11px] tracking-wide text-ink/60 uppercase">
              <th scope="col" className="px-5 py-2.5 font-medium">To</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Message</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Queued</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((message) => (
              <tr key={message.id} className="border-b border-ink/5 last:border-0">
                <td className="px-5 py-3 font-mono text-[12px] text-ink/70">+{message.phoneNumber}</td>
                <td className="max-w-[280px] truncate px-5 py-3 text-[13px] text-ink/70">{message.body}</td>
                <td className="px-5 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 font-mono text-[9px] tracking-wide", TONE[message.status])}>
                    {message.status}
                  </span>
                  {describe(message) && <span className="ml-2 text-[11px] text-ink/60">{describe(message)}</span>}
                </td>
                <td className="px-5 py-3 text-[12px] whitespace-nowrap text-ink/60">{time(message.queuedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
