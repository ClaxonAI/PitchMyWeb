import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";

export const metadata: Metadata = { title: "Terms of Service" };

// DRAFT copy. Have this reviewed by a lawyer before launch.
export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      updated="September 2026"
      intro="These terms explain how you can use PitchMyWeb. By buying a batch or using the product, you agree to them."
      sections={[
        {
          heading: "What PitchMyWeb does",
          body: [
            "PitchMyWeb finds local businesses, builds sample websites and demo recordings for them, and helps you send those samples over WhatsApp.",
            "Sample sites are previews made for pitching. They are not a finished website for the business until you and the business agree on that.",
          ],
        },
        {
          heading: "Your account and number",
          body: [
            "You are responsible for your account and for the WhatsApp number you link or send from.",
            "You must follow WhatsApp's own terms. Sending too many messages too quickly can get a number restricted, and PitchMyWeb can't reverse that.",
          ],
        },
        {
          heading: "Acceptable use",
          body: [
            "Only pitch businesses in a respectful, honest way. Don't impersonate anyone, mislead owners about who built the sample, or keep messaging a business that asked you to stop.",
            "We may suspend accounts that are used for spam or abuse.",
          ],
        },
        {
          heading: "Payments",
          body: [
            "Batches are one-time purchases. Prices are shown before you pay and may change for future purchases.",
            "Refunds are covered by our Refund Policy.",
          ],
        },
        {
          heading: "Changes to these terms",
          body: ["We may update these terms. If a change is significant, we'll let you know before it takes effect."],
        },
      ]}
    />
  );
}
