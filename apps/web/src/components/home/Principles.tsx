import { Eye, Fingerprint, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";

const principles = [
  {
    icon: Eye,
    color: "bg-primary/8 text-primary",
    title: "Proof beats promises",
    body: "An owner can ignore a message about websites. It's much harder to ignore a site that already has their name on it.",
  },
  {
    icon: Fingerprint,
    color: "bg-violet/8 text-violet",
    title: "Your number, your client",
    body: "Pitches go out from your WhatsApp and replies come to you. We never step into the conversation.",
  },
  {
    icon: ShieldCheck,
    color: "bg-lime/30 text-[#4a7010]",
    title: "One lead, one freelancer",
    body: "A business is only ever pitched by one PitchMyWeb user, so you're never competing with the person next to you.",
  },
];

export function Principles() {
  return (
    <section className="border-y border-ink/8 bg-mist-2 py-24 lg:py-32">
      <Container>
        <p className="eyebrow text-primary">Why PitchMyWeb</p>
        <p className="display mt-6 max-w-4xl text-[34px] leading-[1.1] sm:text-5xl">
          Owners don&apos;t need to be told they need a website.{" "}
          <span className="text-ink/60">They need to see theirs.</span>
        </p>

        <div className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
          {principles.map(({ icon: Icon, color, title, body }) => (
            <div key={title} className="group">
              <div className="border-t-2 border-ink/8 pt-7 transition-colors duration-300 group-hover:border-primary/30">
                <span className={`inline-grid size-10 place-items-center rounded-xl ${color} transition-transform duration-300 group-hover:scale-110`}>
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-ink/60">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
