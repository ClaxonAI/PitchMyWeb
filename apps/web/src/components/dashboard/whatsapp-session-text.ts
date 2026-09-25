import type { WhatsAppLogoutReason } from "@/lib/api-client";

// Wording for the WhatsApp session lifetime (apps/api lib/whatsapp/session-policy.ts),
// shared by the WhatsApp page and the campaign steps so they never disagree.

export const SESSION_LIFETIME_TEXT = "Signed out automatically as soon as your campaign finishes sending. You link it again for the next one.";

export function logoutReasonText(reason: WhatsAppLogoutReason): string {
  switch (reason) {
    case "campaign_finished":
      return "We signed your number out when your last campaign finished, to keep your WhatsApp private. Link it again to send this campaign.";
    // Accounts signed out under the old 3-day "stay signed in" option.
    case "stay_linked_expired":
      return "We signed your number out to keep your WhatsApp private. Link it again to send this campaign.";
    case "unused":
      return "We signed your number out because no campaign used it for a day. Link it again when you're ready to send.";
  }
}
