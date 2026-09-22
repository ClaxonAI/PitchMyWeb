import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMetadata } from "@/lib/seo/metadata";
import { simplePageSchema } from "@/lib/seo/structured-data";
import { siteConfig } from "@/data/site";

export const metadata: Metadata = pageMetadata({
  path: "/refunds",
  title: "Refund Policy",
  description:
    "When a batch is refunded or re-run, how to ask, and how long the money takes to come back. A batch that comes up short is on us.",
});

// DRAFT copy. Have this reviewed by a lawyer before launch.
export default function RefundsPage() {
  return (
    <>
      <JsonLd schema={simplePageSchema("Refund Policy", "/refunds")} />
        <LegalPage
        eyebrow="Billing"
        title="Refund Policy"
        updated="September 2026"
        intro="You shouldn't pay for a batch that didn't deliver. Here's how refunds work."
        sections={[
          {
            heading: "Batches that come up short",
            body: [
              "If a batch finds fewer valid leads than the plan promises, you can choose a free re-run or a full refund for that batch.",
            ],
          },
          {
            heading: "Batches you haven't started",
            body: [
              "A purchased batch waits in your account until you press Start. You can ask for a refund at any point before that.",
            ],
          },
          {
            heading: "Batches that have run",
            body: [
              "Once a batch has run and delivered its leads, sites and demos, it can't be refunded, because that work has already been done for you.",
            ],
          },
          {
            heading: "How to ask",
            body: [
              `Email ${siteConfig.email} with your order ID. Approved refunds go back to your original payment method, usually within 5–7 working days.`,
            ],
          },
        ]}
      />
    </>
  );
}
