import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";

const steps = [
  {
    title: "Your batch is saved",
    body: "It sits in your dashboard until you're ready. Nothing runs until you press Start.",
  },
  {
    title: "Pick a city and niche",
    body: "Tell us where to look and what kind of business. We handle the search, sites and demos.",
  },
  {
    title: "Pitches go out",
    body: "Auto sends them from your linked WhatsApp. Direct gives you the links to send yourself.",
  },
  {
    title: "Replies come to you",
    body: "Owners reply to your WhatsApp. Quote your price and build the real site.",
  },
];

export function AfterPayment() {
  return (
    <section className="py-24 lg:py-28">
      <Container>
        <SectionHeading eyebrow="After you pay" title="What happens next." />
        <ol className="mt-12 grid gap-px overflow-hidden rounded-card bg-ink/8 ring-1 ring-ink/8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="bg-white p-6">
              <span className="font-mono text-xs text-primary">0{i + 1}</span>
              <h3 className="mt-6 text-base font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/60">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
