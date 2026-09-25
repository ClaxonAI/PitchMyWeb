import { Check } from "lucide-react";
import { HeroChat } from "@/components/home/HeroChat";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { getPlan, getPrice } from "@/data/plans";
import { formatPrice } from "@/lib/utils";

const assurances = [
  "No code or design skills needed",
  "Sent from your own WhatsApp number",
  "Refund if a batch runs short",
];

export function Hero() {
  const auto = getPlan("auto");
  const price = formatPrice(getPrice(auto, "india"));

  return (
    <section className="relative -mt-16 overflow-hidden pt-16">
      <div aria-hidden className="grid-paper pointer-events-none absolute inset-0" />
      <Container className="relative grid items-center gap-16 pt-14 pb-24 lg:grid-cols-[1.1fr_.9fr] lg:gap-10 lg:pt-24 lg:pb-32">
        <div className="animate-slide-up">
          {/* Eyebrow with social proof */}
          <div className="inline-flex items-center gap-2.5 border-l-2 border-primary bg-white/70 px-3 py-2">
            <span className="size-2 bg-primary" />
            <span className="font-mono text-[11px] tracking-widest text-ink/55 uppercase">
              Find · Build · Record · Send
            </span>
          </div>

          <h1 className="display mt-8 max-w-[760px] text-[46px] leading-[0.97] tracking-[-0.02em] sm:text-6xl lg:text-[74px]">
            Show them the website{" "}
            <em className="not-italic text-primary/90">before</em>{" "}
            they ask for one.
          </h1>

          <p className="mt-7 max-w-[500px] text-[17px] leading-[1.65] text-ink/55 sm:text-lg">
            PitchMyWeb finds local businesses with no website, builds each one a real
            sample site, and puts it on their WhatsApp from your number. You just answer
            the replies.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button href="/pricing" size="lg" arrow>
              Pitch {auto.batchSize} businesses · {price}
            </Button>
            <Button href="/#how" size="lg" variant="outline">
              See how it works
            </Button>
          </div>

          <ul className="mt-10 flex flex-wrap gap-x-7 gap-y-3">
            {assurances.map((item) => (
              <li key={item} className="flex items-center gap-2 text-[13px] text-ink/50">
                <span className="grid size-4 place-items-center rounded-full bg-primary/10">
                  <Check size={10} className="text-primary" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="animate-rise px-6 [animation-delay:150ms] sm:px-10 lg:px-0">
          <HeroChat />
        </div>
      </Container>
    </section>
  );
}
