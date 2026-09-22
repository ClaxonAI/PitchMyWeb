import { Star } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { testimonials } from "@/data/testimonials";
import { cn } from "@/lib/utils";

// Deterministic initials from role string
function initials(role: string) {
  return role
    .split("·")[0]
    .trim()
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function Testimonials() {
  return (
    <section className="py-24 lg:py-32">
      <Container>
        <SectionHeading eyebrow="From freelancers" title="The pitch that gets a reply." />

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {testimonials.map((t, i) => {
            const featured = i === 1;
            return (
              <figure
                key={t.quote}
                className={cn(
                  "flex flex-col justify-between rounded-card p-7 transition-all duration-300",
                  featured
                    ? "bg-primary text-white shadow-lift md:-translate-y-6"
                    : "border border-ink/8 bg-white hover:-translate-y-1 hover:shadow-soft",
                )}
              >
                {/* Stars */}
                <div className={cn("flex gap-0.5", featured ? "text-lime" : "text-[#f5b400]")}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} size={13} className="fill-current" />
                  ))}
                </div>

                <blockquote className="display mt-5 text-[21px] leading-[1.35]">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>

                <figcaption
                  className={cn(
                    "mt-8 flex items-center justify-between gap-3 border-t pt-5",
                    featured ? "border-white/15" : "border-ink/8",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Avatar circle */}
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold",
                        featured ? "bg-white/15 text-white" : "bg-primary/10 text-primary",
                      )}
                    >
                      {initials(t.role)}
                    </span>
                    <span className={cn("truncate text-[13px]", featured ? "text-white/65" : "text-ink/60")}>
                      {t.role}
                    </span>
                  </div>
                  <Badge tone={featured ? "dark" : "neutral"}>{t.plan}</Badge>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
