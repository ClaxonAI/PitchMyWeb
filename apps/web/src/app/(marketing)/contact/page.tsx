import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, MessageCircle } from "lucide-react";
import { ContactForm } from "@/components/contact/ContactForm";
import { Container } from "@/components/ui/Container";
import { siteConfig } from "@/data/site";

export const metadata: Metadata = { title: "Contact" };

const details = [
  { icon: Mail, label: "Email", value: siteConfig.email, href: `mailto:${siteConfig.email}` },
  { icon: Clock, label: "Replies", value: "Within one working day" },
  { icon: MessageCircle, label: "Quick answers", value: "Read the FAQ", href: "/#faq" },
];

export default function ContactPage() {
  return (
    <section className="py-16 lg:py-24">
      <Container className="grid gap-12 lg:grid-cols-[.85fr_1.15fr] lg:gap-20">
        <div>
          <p className="eyebrow text-primary">Contact</p>
          <h1 className="display mt-4 text-5xl leading-[1.02] sm:text-6xl">Talk to a real person.</h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-ink/60">
            Questions about plans, a batch you bought, or anything else. We read every message.
          </p>

          <ul className="mt-10 divide-y divide-ink/8 border-y border-ink/8">
            {details.map(({ icon: Icon, label, value, href }) => (
              <li key={label} className="flex items-center gap-4 py-4">
                <span className="grid size-10 place-items-center rounded-xl bg-mist text-primary">
                  <Icon size={17} />
                </span>
                <div>
                  <p className="text-xs text-ink/45">{label}</p>
                  {href ? (
                    <Link href={href} className="text-[15px] font-medium hover:text-primary">
                      {value}
                    </Link>
                  ) : (
                    <p className="text-[15px] font-medium">{value}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-panel border border-ink/8 bg-mist-2 p-6 sm:p-9">
          <ContactForm />
        </div>
      </Container>
    </section>
  );
}
