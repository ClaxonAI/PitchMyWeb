import Link from "next/link";
import { LayoutTemplate, Search, Send, Video } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { getPlan, getPrice } from "@/data/plans";
import { formatPrice } from "@/lib/utils";

const steps = [
  { title: "Find a business", time: "~2 hrs", Icon: Search },
  { title: "Build their site", time: "~4 hrs", Icon: LayoutTemplate },
  { title: "Record a demo", time: "~1 hr", Icon: Video },
  { title: "Send the pitch", time: "~1 hr", Icon: Send },
] as const;

export function ProblemSection() {
  const foreignAuto = formatPrice(getPrice(getPlan("auto"), "foreign"));

  return (
    <>
      <section
        id="play"
        className="relative overflow-hidden bg-mist-2 pb-28 pt-24 text-ink lg:pb-32 lg:pt-28"
      >
        <Container>
          <div className="mx-auto max-w-[44rem] text-center">
            <p className="font-mono text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
              The play
            </p>
            <h2 className="display mt-5 text-[36px] leading-[1.12] tracking-[-0.02em] text-ink sm:text-[44px] lg:text-[50px]">
              This isn&apos;t a new idea. It&apos;s been paying freelancers for years —{" "}
              <em className="italic">it&apos;s just brutal to do.</em>
            </h2>
          </div>

          <ul className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3.5">
            {steps.map((step) => (
              <li
                key={step.title}
                className="flex min-h-[152px] flex-col rounded-[1.15rem] border border-ink/8 bg-paper px-5 py-5 shadow-[0_1px_0_rgba(10,10,10,0.03)]"
              >
                <span className="grid size-9 place-items-center rounded-full bg-primary/8 text-primary">
                  <step.Icon size={15} strokeWidth={1.55} />
                </span>
                <p className="mt-5 text-[15px] font-semibold tracking-tight text-ink">{step.title}</p>
                <p className="mt-auto pt-6 font-mono text-[12px] tracking-wide text-violet">{step.time}</p>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-right font-mono text-[11px] tracking-wide text-ink/60 sm:text-[12px]">
            8 hours a day · Max 7–8 pitches · most people quit here
          </p>

          <div className="relative mx-auto my-2 flex h-[88px] w-[120px] items-end justify-center" aria-hidden>
            <svg viewBox="0 0 120 88" className="absolute inset-0 size-full text-primary" fill="none">
              <path
                d="M60 6 C60 22 60 28 60 36 C60 48 42 46 38 56 C34 66 52 64 60 68 L60 76"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeDasharray="2.8 4.2"
                strokeLinecap="round"
              />
              <path
                d="M54 72 L60 80 L66 72"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="rounded-[1.6rem] bg-primary px-8 py-12 text-white sm:px-12 sm:py-14 lg:px-16 lg:py-16">
            <p className="font-mono text-[11px] font-medium tracking-[0.22em] text-lilac uppercase">
              With PitchMyWeb
            </p>
            <h3 className="display mt-4 text-[40px] leading-[1.05] tracking-[-0.02em] sm:text-[48px] lg:text-[56px]">
              All of it. One tap.
            </h3>
            <p className="mt-5 max-w-[36rem] text-[16px] leading-[1.65] text-white/75 sm:text-[17px]">
              Agents find them, build the sites, record the demos and send from your WhatsApp. You just answer the
              replies.
            </p>
          </div>
        </Container>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink">
        <Container className="flex items-center justify-between gap-4 py-3.5">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-white sm:text-[15px]">
              Start a campaign from {foreignAuto}
            </p>
            <p className="truncate text-[12px] text-white/60">India &amp; Global · Automatic or Direct</p>
          </div>
          <Link
            href="/pricing"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-paper px-5 text-[13px] font-semibold text-ink transition hover:bg-mist"
          >
            See plans →
          </Link>
        </Container>
      </div>
    </>
  );
}
