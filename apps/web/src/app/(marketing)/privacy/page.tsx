import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMetadata } from "@/lib/seo/metadata";
import { simplePageSchema } from "@/lib/seo/structured-data";
import { postalAddress, siteConfig } from "@/data/site";

const officer = siteConfig.grievanceOfficer;

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
            heading: "Who we are",
            body: [
              `PitchMyWeb is run by ${siteConfig.legalName}, ${postalAddress}. ${siteConfig.legalName} decides how the personal data described here is used.`,
            ],
          },
          {
            heading: "What we collect",
            body: [
              "Your account details (name, email), your purchase history, and the settings you choose for each batch.",
              "If you use Auto, we keep the session needed to send pitches from your linked WhatsApp. We don't read your other chats.",
              "That session lasts only as long as your campaign: once its pitches have gone out we sign your number out and delete the stored session.",
              "The demo videos we record for your leads can be watched and downloaded for 7 days, then are deleted from our storage.",
            ],
          },
          {
            heading: "How we use it",
            body: [
              "To run your batches, process payments, provide support, and keep the service secure.",
            ],
          },
          {
            heading: "Services that process data for us",
            body: [
              "Amazon Web Services hosts the site and stores its data in Mumbai, India. Razorpay processes payments; we never see or store your card or UPI details. Clerk handles Google and GitHub sign-in.",
              "OpenAI helps write the pitch messages and sample site copy, from public business details only. Google and Serper provide the public business listings we search.",
              "Each of them only gets what it needs for that job, and none of them may use it for their own purposes.",
            ],
          },
          {
            heading: "How long we keep it",
            body: [
              "Demo videos: 7 days. Sample sites: until their preview link expires. WhatsApp sessions: until the campaign's pitches have gone out.",
              "Your account and purchase history: until you ask us to delete your account. We keep payment records longer only where tax law requires it.",
            ],
          },
          {
            heading: "Business data",
            body: [
              "Lead information comes from publicly listed business details: name, category, address and public phone number.",
              "Every pitch ends with an opt-out. A business that replies STOP is not messaged again from PitchMyWeb.",
              `Any business can ask us to delete its details or stop including it by emailing ${siteConfig.email}.`,
            ],
          },
          {
            heading: "Your choices",
            body: [
              `You can ask to see, correct or delete your data by emailing ${siteConfig.email}.`,
              "You can unlink your WhatsApp from PitchMyWeb at any time, from your dashboard or from WhatsApp itself.",
            ],
          },
          {
            heading: "Grievance Officer",
            body: [
              officer.name
                ? `Our Grievance Officer is ${officer.name}${officer.designation ? `, ${officer.designation}` : ""}, ${siteConfig.legalName}. Email ${officer.email}, or write to ${postalAddress}.`
                : `Our Grievance Officer will be named here shortly. Until then, send complaints to ${officer.email}, or write to ${siteConfig.legalName}, ${postalAddress}.`,
              "We acknowledge every complaint within 24 hours and resolve it within 15 days, as the Digital Personal Data Protection Act, 2023 and the IT Rules, 2021 require.",
            ],
          },
        ]}
      />
    </>
  );
}
