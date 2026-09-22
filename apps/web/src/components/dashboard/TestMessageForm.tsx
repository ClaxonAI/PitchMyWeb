"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError, whatsappApi, type MessagePreview } from "@/lib/api-client";

// Preview first, then send. The preview is a real policy evaluation against
// the same rules the worker applies, so "this number has opted out" appears
// before the user commits rather than as a message that quietly dies.

export function TestMessageForm({ accountId, onSent }: { accountId: string; onSent: () => void }) {
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<MessagePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset(): void {
    setPreview(null);
    setError(null);
    setNotice(null);
  }

  async function onPreview(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    reset();
    setPending(true);
    try {
      setPreview(await whatsappApi.previewMessage({ accountId, phoneNumber: phone, body }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not build a preview.");
    } finally {
      setPending(false);
    }
  }

  async function onSend(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      await whatsappApi.sendMessage({ accountId, phoneNumber: phone, body });
      setNotice("Queued. Watch the status below.");
      setPreview(null);
      setBody("");
      onSent();
    } catch (caught) {
      // The policy returns its reason as the error code, so a denial that
      // appeared between preview and send still lands as a specific,
      // actionable message rather than a generic failure.
      setError(caught instanceof ApiError ? caught.message : "Could not queue the message.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-card border border-ink/8 bg-white p-5 sm:p-6">
      <p className="text-sm font-semibold">Send a test message</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink/60">
        Use your own second number, or a contact who has agreed to hear from you.
      </p>

      <form onSubmit={onPreview} className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink/70">To</span>
          <input
            type="tel"
            required
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              reset();
            }}
            placeholder="+91 98000 00001"
            className="h-11 rounded-2xl border border-ink/12 bg-white px-4 text-sm outline-none transition focus:border-primary/50"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink/70">Message</span>
          <textarea
            required
            rows={4}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              reset();
            }}
            placeholder="Hi — I built a quick sample site for your business…"
            className="resize-y rounded-2xl border border-ink/12 bg-white px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-primary/50"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {pending && !preview ? "Checking…" : "Preview"}
          </Button>
          {preview?.policy.allowed && (
            <Button type="button" size="sm" disabled={pending} onClick={() => void onSend()}>
              {pending ? "Queueing…" : "Send it"}
            </Button>
          )}
        </div>
      </form>

      {preview && (
        <div className="mt-5 rounded-2xl border border-ink/8 bg-mist-2 p-4">
          <p className="text-[11px] tracking-wide text-ink/60 uppercase">Preview</p>
          <p className="mt-1 font-mono text-[12px] text-ink/60">to +{preview.phoneNumber}</p>
          <p className="mt-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-ink/80">{preview.body}</p>
          {!preview.policy.allowed && (
            <p role="alert" className="mt-3 border-t border-ink/8 pt-3 text-[13px] text-[#c2412f]">
              {preview.policy.message}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-2xl border border-coral/30 bg-coral/8 px-4 py-3 text-[13px] text-[#c2412f]">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-2xl border border-whatsapp/30 bg-whatsapp/8 px-4 py-3 text-[13px] text-[#0a7a3c]">{notice}</p>
      )}
    </div>
  );
}
