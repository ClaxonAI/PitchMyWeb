import Link from "next/link";
import { Accordion } from "@/components/ui/Accordion";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { Faq } from "@/types";
import { faqs } from "@/data/faq";

// Defaults to the home page's set so the home page keeps calling this with no
// props. /pricing passes its own questions — see data/faq.ts for why the two
// pages must not share one array.
type FAQSectionProps = {
  items?: Faq[];
  eyebrow?: string;
  title?: string;
};

export function FAQSection({ items = faqs, eyebrow = "FAQ", title = "Questions before your first batch." }: FAQSectionProps) {
  return (
    <section id="faq" className="scroll-mt-20 py-24 lg:py-32">
      <Container className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
        <div>
          <SectionHeading eyebrow={eyebrow} title={title} />
          <p className="mt-6 text-[15px] text-ink/60">
            Something else?{" "}
            <Link href="/contact" className="text-primary underline underline-offset-4">
              Ask us directly
            </Link>
            .
          </p>
        </div>
        <Accordion items={items} />
      </Container>
    </section>
  );
}
