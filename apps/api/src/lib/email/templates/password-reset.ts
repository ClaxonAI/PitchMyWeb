import type { RenderedEmail } from "../email.service";
import { escapeHtml, renderLayout } from "./layout";

// The two emails of a password reset (lib/auth/password-reset.ts): the code,
// and the notice once the password has changed. Neither contains a link that
// resets anything: the code is typed into the page that asked for it, so a
// forwarded or scanned email can't be used on its own.

export function renderPasswordResetCode(input: { code: string; minutes: number }): RenderedEmail {
  const spaced = `${input.code.slice(0, 3)} ${input.code.slice(3)}`;
  const html = renderLayout({
    preheader: `Your code is ${spaced}. It expires in ${input.minutes} minutes.`,
    heading: "Your password reset code",
    bodyHtml: `<p style="margin:0 0 20px">Enter this code on the PitchMyWeb page where you asked to reset your password.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="background:#f4f5f9;border:1px solid #e6e8f0;border-radius:12px;padding:16px 24px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#1a1f36">${escapeHtml(spaced)}</td></tr></table>
<p style="margin:0 0 16px;color:#5b6178">It expires in ${input.minutes} minutes and works once. PitchMyWeb will never ask you for this code by phone, WhatsApp or email.</p>`,
    footerNoteHtml: "Didn't ask to reset your password? Ignore this email; your password stays as it is.",
  });
  const text = [
    "Your PitchMyWeb password reset code:",
    "",
    `    ${spaced}`,
    "",
    "Enter it on the page where you asked to reset your password.",
    `It expires in ${input.minutes} minutes and works once. PitchMyWeb will never ask you for this code by phone, WhatsApp or email.`,
    "",
    "Didn't ask to reset your password? Ignore this email; your password stays as it is.",
    "",
    "PitchMyWeb, a product of Claxon AI · https://pitchmyweb.in",
  ].join("\n");
  return { subject: `${spaced} is your PitchMyWeb reset code`, html, text };
}

export function renderPasswordChanged(input: { appUrl: string; when: Date }): RenderedEmail {
  const appUrl = input.appUrl.replace(/\/+$/, "");
  const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(input.when);
  const html = renderLayout({
    preheader: "Your PitchMyWeb password was just changed.",
    heading: "Your password was changed",
    bodyHtml: `<p style="margin:0 0 16px">The password for your PitchMyWeb account was reset on ${escapeHtml(when)} IST. Every other device has been signed out.</p>
<p style="margin:0 0 16px">If this was you, there's nothing else to do.</p>`,
    cta: { label: "Open your dashboard", url: `${appUrl}/dashboard` },
    footerNoteHtml: "Wasn't you? Reset your password again straight away from the sign-in page, and reply to this email so we can help.",
  });
  const text = [
    "Your password was changed.",
    "",
    `The password for your PitchMyWeb account was reset on ${when} IST. Every other device has been signed out.`,
    "If this was you, there's nothing else to do.",
    "",
    "Wasn't you? Reset your password again straight away from the sign-in page, and reply to this email so we can help.",
    "",
    "PitchMyWeb, a product of Claxon AI · https://pitchmyweb.in",
  ].join("\n");
  return { subject: "Your PitchMyWeb password was changed", html, text };
}
