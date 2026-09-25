import { STAY_LINKED_DAYS, type WhatsAppLogoutReason } from "@/lib/api-client";

// Wording for the WhatsApp session lifetime (apps/api lib/whatsapp/session-policy.ts),
// shared by the WhatsApp page and the campaign steps so they never disagree.

export function formatSignedInUntil(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** Whether a "keep me signed in" window is still open. */
export function isStayLinkedActive(stayLinkedUntil: string | null, now = Date.now()): boolean {
  return Boolean(stayLinkedUntil && new Date(stayLinkedUntil).getTime() > now);
}

export function sessionLifetimeText(stayLinkedUntil: string | null): string {
  return isStayLinkedActive(stayLinkedUntil)
    ? `Stays signed in until ${formatSignedInUntil(stayLinkedUntil!)} — new campaigns before then start without linking again.`
    : "Signed out automatically as soon as your campaign finishes sending.";
}

export const STAY_LINKED_LABEL = `Keep me signed in for ${STAY_LINKED_DAYS} days`;

export function stayLinkedHint(checked: boolean): string {
  return checked
    ? `Campaigns you start in the next ${STAY_LINKED_DAYS} days use this number without linking again. After that we sign it out.`
    : "For your privacy we sign this number out as soon as the campaign has finished sending. You link it again for the next one.";
}

export function logoutReasonText(reason: WhatsAppLogoutReason): string {
  switch (reason) {
    case "campaign_finished":
      return "We signed your number out when your last campaign finished, to keep your WhatsApp private. Link it again to send this campaign.";
    case "stay_linked_expired":
      return `Your ${STAY_LINKED_DAYS} days of staying signed in are up, so we signed your number out. Link it again to keep sending.`;
    case "unused":
      return "We signed your number out because no campaign used it for a day. Link it again when you're ready to send.";
  }
}
