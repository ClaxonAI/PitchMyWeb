import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import type { Faq } from "@/types";

// Building blocks for the SEO landing pages (/for, /in, /guides). Plain
// server components in the marketing style, so every page ships as static
// HTML with its content in the first response.

export function Breadcrumbs({ trail }: { trail: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[13px] text-ink/60">
      <Link href="/" className="hover:text-ink">Home</Link>
      {trail.map((crumb, index) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight size={13} aria-hidden />
          {index === trail.length - 1 ? (
            <span aria-current="page" className="text-ink/80">{crumb.name}</span>
          ) : (
            <Link href={crumb.path} className="hover:text-ink">{crumb.name}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}

export function LandingHero({
  trail,
  eyebrow,
  title,
  intro,
}: {
  trail: { name: string; path: string }[];
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <section className="pt-10 pb-12 lg:pt-14 lg:pb-16">
      <Container>
        <Breadcrumbs trail={trail} />
        <p className="eyebrow mt-8 text-primary">{eyebrow}</p>
        <h1 className="display mt-4 max-w-4xl text-[40px] leading-[1.04] sm:text-6xl">{title}</h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink/65">{intro}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="/register" variant="primary" arrow>Start pitching</Button>
          <Button href="/pricing" variant="outline">See pricing</Button>
        </div>
      </Container>
    </section>
  );
}

export function LandingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink/8 py-12 lg:py-16">
      <Container className="grid gap-6 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
        <h2 className="display text-3xl leading-tight sm:text-4xl">{title}</h2>
        <div className="flex flex-col gap-4 text-[16px] leading-relaxed text-ink/70">{children}</div>
      </Container>
    </section>
  );
}

export function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function LinkGrid({ title, links }: { title: string; links: { href: string; label: string; note?: string }[] }) {
  return (
    <section className="border-t border-ink/8 py-12 lg:py-16">
      <Container>
        <h2 className="display text-3xl leading-tight sm:text-4xl">{title}</h2>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="group flex h-full flex-col gap-1 rounded-2xl border border-ink/10 bg-white p-4 transition hover:border-primary/40"
              >
                <span className="flex items-center justify-between gap-2 text-[15px] font-medium text-ink">
                  {link.label}
                  <ChevronRight size={16} className="text-ink/40 transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                </span>
                {link.note && <span className="text-[13px] leading-snug text-ink/60">{link.note}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <LandingSection title="Questions">
      <dl className="flex flex-col gap-6">
        {faqs.map((faq) => (
          <div key={faq.question}>
            <dt className="font-medium text-ink">{faq.question}</dt>
            <dd className="mt-1.5">{faq.answer}</dd>
          </div>
        ))}
      </dl>
    </LandingSection>
  );
}

export function LandingCta({ title }: { title: string }) {
  return (
    <section className="py-16 lg:py-20">
      <Container>
        <div className="rounded-panel bg-primary px-6 py-14 text-center text-white sm:px-12">
          <h2 className="display mx-auto max-w-2xl text-4xl leading-tight sm:text-5xl">{title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-[16px] text-white/75">
            We find the businesses, build each one a sample site and a demo video, and pitch it from your WhatsApp. You answer the replies.
          </p>
          <div className="mt-8 flex justify-center">
            <Button href="/register" variant="light" arrow>Start pitching</Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
