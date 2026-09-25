import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMetadata } from "@/lib/seo/metadata";
import { simplePageSchema } from "@/lib/seo/structured-data";
import { siteConfig } from "@/data/site";

export const metadata: Metadata = pageMetadata({
  path: "/privacy",
  title: "Privacy Policy",
  description:
    "What PitchMyWeb collects, why we collect it, how long we keep it, and the choices you have. We never sell your data.",
});

// DRAFT copy. Have this reviewed by a lawyer before launch.
export default function PrivacyPage() {
  return (
    <>
      <JsonLd schema={simplePageSchema("Privacy Policy", "/privacy")} />
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
              "That session lasts only as long as your campaign: once its pitches have gone out we sign your number out and delete the stored session. If you choose to stay signed in, we keep it for 3 days, then sign you out the same way.",
              "The demo videos we record for your leads can be watched and downloaded for 7 days, then are deleted from our storage.",
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
    </>
  );
}
