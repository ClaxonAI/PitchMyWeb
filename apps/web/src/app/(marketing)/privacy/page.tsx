import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";
import { siteConfig } from "@/data/site";

export const metadata: Metadata = { title: "Privacy Policy" };

// DRAFT copy. Have this reviewed by a lawyer before launch.
export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      updated="September 2026"
      intro="We collect as little as we need to run PitchMyWeb, and we never sell your data."
      sections={[
        {
          heading: "What we collect",
          body: [
            "Your account details (name, email), your purchase history, and the settings you choose for each batch.",
            "If you use Auto, we keep the session needed to send pitches from your linked WhatsApp. We don't read your other chats.",
          ],
        },
        {
          heading: "How we use it",
          body: [
            "To run your batches, process payments, provide support, and keep the service secure.",
            "We use basic, privacy-friendly analytics to understand which pages people use.",
          ],
        },
        {
          heading: "Business data",
          body: [
            "Lead information comes from publicly listed business details. Businesses can ask us to stop including them at any time.",
          ],
        },
        {
          heading: "Your choices",
          body: [
            `You can ask to see, correct or delete your data by emailing ${siteConfig.email}.`,
            "You can unlink your WhatsApp from PitchMyWeb at any time, from your dashboard or from WhatsApp itself.",
          ],
        },
      ]}
    />
  );
}
