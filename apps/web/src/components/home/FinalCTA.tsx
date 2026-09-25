import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { getPlan, getPrice } from "@/data/plans";
import { formatPrice } from "@/lib/utils";

export function FinalCTA() {
  const auto = getPlan("auto");
  return (
    <section className="pb-24 lg:pb-32">
      <Container>
        <div className="relative overflow-hidden rounded-panel bg-primary px-6 py-20 text-center text-white sm:px-12 lg:py-28">
          {/* Deep lilac radial from top */}
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_-10%,rgb(155_138_255/0.65),transparent)]"
          />
          {/* Subtle grid overlay */}
          <div
            aria-hidden
            className="absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.05)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
          />
          {/* Bottom vignette */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-primary to-transparent"
          />

          <div className="relative">
            <h2 className="display mx-auto max-w-3xl text-[42px] leading-[1.0] tracking-[-0.02em] sm:text-6xl">
              Someone will sell these businesses a website.{" "}
              <em className="not-italic text-lime/90">Make it you.</em>
            </h2>
            <p className="mx-auto mt-7 max-w-md text-[17px] leading-relaxed text-white/85">
              Start with {auto.batchSize} pitches for{" "}
              {formatPrice(getPrice(auto, "india"))}. It takes about two minutes to set up.
            </p>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Button href="/pricing" variant="light" size="lg" arrow>
                Claim my first batch
              </Button>
              <Button
                href="/#how"
                size="lg"
                variant="ghost"
                className="text-white/90 hover:bg-white/10 hover:text-white"
              >
                How it works
              </Button>
            </div>

            <div className="mt-12 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-[13px] text-white/75 backdrop-blur-sm">
              <ShieldCheck size={16} className="shrink-0 text-lime" />
              Fewer valid leads than promised? That batch is on us.
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
