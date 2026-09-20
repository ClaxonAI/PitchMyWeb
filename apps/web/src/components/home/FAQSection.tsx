import Link from "next/link";
import { Accordion } from "@/components/ui/Accordion";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { faqs } from "@/data/faq";

export function FAQSection() {
  return (
    <section id="faq" className="scroll-mt-20 py-24 lg:py-32">
      <Container className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
        <div>
          <SectionHeading eyebrow="FAQ" title="Questions before your first batch." />
          <p className="mt-6 text-[15px] text-ink/55">
            Something else?{" "}
            <Link href="/contact" className="text-primary underline underline-offset-4">
              Ask us directly
            </Link>
            .
          </p>
        </div>
        <Accordion items={faqs} />
      </Container>
    </section>
  );
}
