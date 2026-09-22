import { MapPin, Play, Send } from "lucide-react";
import { SitePreview } from "@/components/mocks/SitePreview";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { sampleSites } from "@/data/sampleSites";
import { cn } from "@/lib/utils";

function FindVisual() {
  const leads = [
    { name: "Morrow Coffee", meta: "Café · 4.7★", fresh: true },
    { name: "Northstar Dental", meta: "Clinic · 4.9★", fresh: true },
    { name: "Ironline Gym", meta: "Gym · 4.6★", fresh: false },
  ];
  return (
    <div className="space-y-2">
      {leads.map((lead, i) => (
        <div
          key={lead.name}
          className={cn(
            "flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-ink/8 transition-all duration-300",
            i === 0 && "ring-primary/30 shadow-[0_0_0_3px_rgb(51_54_205/0.06)]",
          )}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
            <MapPin size={13} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{lead.name}</p>
            <p className="text-[11px] text-ink/60">{lead.meta}</p>
          </div>
          <span className="shrink-0 rounded-md bg-coral/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#c2412f]">
            NO SITE
          </span>
        </div>
      ))}
    </div>
  );
}

function RecordVisual() {
  return (
    <div className="overflow-hidden rounded-xl bg-ink ring-1 ring-ink/6">
      <div className="relative">
        <SitePreview site={sampleSites[2]} compact className="rounded-none border-0 opacity-80" />
        <span className="absolute inset-0 grid place-items-center bg-ink/20">
          <span className="grid size-11 place-items-center rounded-full bg-white/95 shadow-soft">
            <Play size={15} className="ml-0.5 fill-ink" />
          </span>
        </span>
        <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-coral px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider text-white">
          <span className="size-1.5 animate-pulse rounded-full bg-white" /> REC
        </span>
      </div>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="h-1 flex-1 rounded-full bg-white/10">
          <span className="block h-1 w-2/5 rounded-full bg-lime" />
        </span>
        <span className="font-mono text-[10px] tabular-nums text-white/60">0:12 / 0:30</span>
      </div>
    </div>
  );
}

function SendVisual() {
  return (
    <div className="space-y-2 rounded-xl bg-[#efeae2] p-3">
      <div className="ml-auto max-w-[85%] rounded-[14px] rounded-tr-[4px] bg-[#d9fdd3] px-3.5 py-2.5 text-[12px] leading-relaxed shadow-sm">
        Made a site for Northstar — have a look 👇
      </div>
      <div className="max-w-[80%] rounded-[14px] rounded-tl-[4px] bg-white px-3.5 py-2.5 text-[12px] leading-relaxed shadow-sm">
        This is really nice. Can we talk tomorrow?
      </div>
      <div className="flex items-center gap-1.5 pt-1 font-mono text-[9px] text-ink/60">
        <Send size={10} />
        sent from +91 ••••• 43210
      </div>
    </div>
  );
}

const steps = [
  {
    num: "01",
    title: "We find the businesses",
    body: "Local businesses with good reviews and no website, picked by city and niche. No lead is ever given to two users.",
    visual: <FindVisual />,
  },
  {
    num: "02",
    title: "We build their site",
    body: "Each one gets its own sample site, using their name, their category and a design that suits them.",
    visual: <SitePreview site={sampleSites[1]} compact />,
  },
  {
    num: "03",
    title: "We record the demo",
    body: "A short walkthrough video, so the owner sees the site working without having to click anything.",
    visual: <RecordVisual />,
  },
  {
    num: "04",
    title: "It goes out on WhatsApp",
    body: "From your own number, automatically or with one tap. Replies come straight to you.",
    visual: <SendVisual />,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 bg-mist py-24 lg:py-32">
      <Container>
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading eyebrow="How it works" title="Four steps. You only do the last one." />
          <p className="max-w-[320px] text-[15px] leading-relaxed text-ink/60 lg:pb-2">
            Everything before the reply is handled for you. Everything after it is where you earn.
          </p>
        </div>

        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="group relative flex flex-col rounded-card border border-ink/6 bg-white/70 p-5 transition-all duration-300 hover:-translate-y-1.5 hover:bg-white hover:shadow-[0_20px_50px_rgb(10_10_10/0.08)]"
            >
              {/* Large ghost number behind card content */}
              <span
                aria-hidden
                className="pointer-events-none absolute top-3 right-4 font-mono text-[56px] font-bold leading-none text-ink/[0.04] select-none transition-all duration-300 group-hover:text-ink/[0.06]"
              >
                {step.num}
              </span>

              <div className="flex h-[168px] items-center">
                <div aria-hidden className="w-full">{step.visual}</div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink font-mono text-[11px] font-bold text-white transition-colors duration-300 group-hover:bg-primary">
                  {i + 1}
                </span>
                <h3 className="text-[16px] font-semibold tracking-tight">{step.title}</h3>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink/60">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
