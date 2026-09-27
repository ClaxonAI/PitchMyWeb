import type { RenderedEmail } from "../email.service";
import { escapeHtml, renderLayout } from "./layout";

// Sent once, right after an account is created (lib/email/welcome.ts). Three
// steps that match the dashboard, and the free pitches only when the account
// actually has them: they come with a verified (Google/GitHub) sign-up.

export type WelcomeInput = {
  name: string | null;
  /** Free pitches in the wallet now; 0 for a password sign-up. */
  freePitches: number;
  appUrl: string;
};

export function renderWelcome(input: WelcomeInput): RenderedEmail {
  const appUrl = input.appUrl.replace(/\/+$/, "");
  const firstName = input.name?.trim().split(/\s+/)[0] || null;
  const greeting = firstName ? `Welcome, ${firstName}` : "Welcome to PitchMyWeb";
  const free = input.freePitches > 0 ? `Your first ${input.freePitches} pitches are on us.` : null;
  const steps: Array<[string, string]> = [
    ["Link your WhatsApp", "Pitches go out from your own number, so replies come straight to you."],
    ["Pick a trade and a city", "We find local businesses that don't have a website yet."],
    ["Send the pitches", "Each owner gets a sample website built for them, with a short demo video."],
  ];

  const stepsHtml = steps
    .map(
      ([title, body], index) =>
        `<tr><td valign="top" style="padding:0 12px 14px 0;width:28px"><span style="display:inline-block;width:24px;height:24px;border-radius:12px;background:#eef2ff;color:#3157d5;font-size:13px;font-weight:700;line-height:24px;text-align:center">${index + 1}</span></td><td style="padding:0 0 14px;font-size:15px;line-height:22px"><strong>${escapeHtml(title)}</strong><br><span style="color:#5b6178">${escapeHtml(body)}</span></td></tr>`,
    )
    .join("");

  const html = renderLayout({
    preheader: free ?? "Here's how to send your first pitches.",
    heading: greeting,
    bodyHtml: `<p style="margin:0 0 20px">Thanks for joining. PitchMyWeb shows local businesses the website they could have, before they ask for one.${free ? ` <strong>${escapeHtml(free)}</strong>` : ""}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px">${stepsHtml}</table>`,
    cta: { label: "Start your first campaign", url: `${appUrl}/campaigns/new` },
    footerNoteHtml: "Questions? Reply to this email or write to us through pitchmyweb.in/contact.",
  });

  const text = [
    `${greeting}.`,
    "",
    `Thanks for joining. PitchMyWeb shows local businesses the website they could have, before they ask for one.${free ? ` ${free}` : ""}`,
    "",
    ...steps.map(([title, body], index) => `${index + 1}. ${title}: ${body}`),
    "",
    `Start your first campaign: ${appUrl}/campaigns/new`,
    "",
    "Questions? Reply to this email or write to us through pitchmyweb.in/contact.",
    "",
    "PitchMyWeb, a product of Claxon AI · https://pitchmyweb.in",
  ].join("\n");

  return { subject: free ? `Welcome to PitchMyWeb: ${input.freePitches} free pitches inside` : "Welcome to PitchMyWeb", html, text };
}
