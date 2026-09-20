import { Container } from "@/components/ui/Container";

export type LegalSection = { heading: string; body: string[] };

/** Shared layout for Terms, Privacy and Refunds. */
export function LegalPage({
  eyebrow,
  title,
  updated,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <section className="py-16 lg:py-24">
      <Container className="grid gap-12 lg:grid-cols-[240px_1fr] lg:gap-20">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow text-primary">{eyebrow}</p>
          <nav aria-label="On this page" className="mt-6 hidden lg:block">
            <ul className="space-y-2.5 border-l border-ink/10">
              {sections.map((s, i) => (
                <li key={s.heading}>
                  <a
                    href={`#section-${i + 1}`}
                    className="-ml-px block border-l border-transparent pl-4 text-[13px] text-ink/50 transition-colors hover:border-primary hover:text-ink"
                  >
                    {s.heading}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <article className="max-w-2xl">
          <h1 className="display text-5xl sm:text-6xl">{title}</h1>
          <p className="mt-4 font-mono text-xs text-ink/40">Last updated {updated}</p>
          <p className="mt-8 text-lg leading-relaxed text-ink/70">{intro}</p>

          <div className="mt-12 space-y-12">
            {sections.map((s, i) => (
              <section key={s.heading} id={`section-${i + 1}`} className="scroll-mt-24">
                <h2 className="flex items-baseline gap-3 text-xl font-semibold tracking-tight">
                  <span className="font-mono text-xs font-normal text-primary">{String(i + 1).padStart(2, "0")}</span>
                  {s.heading}
                </h2>
                <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink/65">
                  {s.body.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </Container>
    </section>
  );
}
