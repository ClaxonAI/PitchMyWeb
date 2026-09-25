"use client";

import { useId, useRef } from "react";
import { Building2, Link2, RotateCcw } from "lucide-react";
import { Button } from "@/components/dashboard-ui/button";
import { Label } from "@/components/dashboard-ui/label";
import {
  BUSINESS_NAME_PLACEHOLDER,
  DEFAULT_MESSAGE_TEMPLATE,
  MAX_MESSAGE_TEMPLATE_CHARS,
  messageTemplateProblem,
  previewMessage,
  SITE_LINK_PLACEHOLDER,
} from "@/lib/message-template";

/**
 * The WhatsApp message a campaign sends, with the two things that change per
 * business one tap away and a live preview of what one business receives.
 * Controlled: the parent owns the text.
 */
export function MessageTemplateEditor({
  value,
  onChange,
  sampleBusiness = "Sri Lakshmi Dental Care",
  label = "WhatsApp message",
}: {
  value: string;
  onChange: (value: string) => void;
  sampleBusiness?: string;
  label?: string;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const problem = messageTemplateProblem(value);
  const sampleSite = `https://preview.pitchmyweb.in/s/${sampleBusiness.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  // Inserts at the cursor (or replaces the selection) and puts the cursor
  // after what was inserted, so it reads like typing it.
  function insert(token: string) {
    const element = textarea.current;
    if (!element) return onChange(`${value}${token}`);
    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => insert(BUSINESS_NAME_PLACEHOLDER)}>
            <Building2 /> Business name
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => insert(SITE_LINK_PLACEHOLDER)}>
            <Link2 /> Site link
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(DEFAULT_MESSAGE_TEMPLATE)} disabled={value === DEFAULT_MESSAGE_TEMPLATE}>
            <RotateCcw /> Reset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <textarea
            id={id}
            ref={textarea}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={9}
            maxLength={MAX_MESSAGE_TEMPLATE_CHARS + 200}
            aria-invalid={problem ? true : undefined}
            aria-describedby={`${id}-help`}
            className="w-full resize-y rounded-dash-md border border-dash-border bg-dash-background px-3 py-2 text-sm leading-relaxed text-dash-foreground shadow-xs outline-none focus-visible:border-dash-ring focus-visible:ring-[3px] focus-visible:ring-dash-ring/50 aria-invalid:border-dash-destructive"
          />
          <div id={`${id}-help`} className="flex flex-wrap justify-between gap-2 text-xs">
            <span className={problem ? "text-dash-destructive" : "text-dash-muted-foreground"}>
              {problem ?? "Each business gets its own name and site link. Both videos are attached automatically."}
            </span>
            <span className={value.length > MAX_MESSAGE_TEMPLATE_CHARS ? "text-dash-destructive" : "text-dash-muted-foreground"}>
              {value.length}/{MAX_MESSAGE_TEMPLATE_CHARS}
            </span>
          </div>
        </div>

        {/* What one business actually receives, styled like the chat it lands in. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-dash-muted-foreground">Preview for {sampleBusiness}</span>
          <div className="flex min-h-full flex-col gap-2 rounded-dash-lg bg-[#e7ddd3] p-3">
            <div className="grid grid-cols-2 gap-1.5 self-end">
              <span className="grid aspect-[9/16] w-16 place-items-center rounded-md bg-black/70 text-[10px] text-white/80">▶ Phone</span>
              <span className="grid aspect-[16/10] w-24 place-items-center self-end rounded-md bg-black/70 text-[10px] text-white/80">▶ Laptop</span>
            </div>
            <p className="max-w-[92%] self-end rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-[#111b21] shadow-sm">
              {previewMessage(value, sampleBusiness, sampleSite)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
