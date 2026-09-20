const niches = [
  "Cafés",
  "Salons",
  "Dental clinics",
  "Gyms",
  "Bakeries",
  "Boutiques",
  "Restaurants",
  "Tutors",
  "Photographers",
  "Florists",
  "Car detailers",
  "Yoga studios",
];

export function TrustStrip() {
  return (
    <section aria-label="Businesses we build for" className="border-y border-ink/8 bg-mist-2">
      <div className="flex items-center">
        <p className="eyebrow hidden shrink-0 border-r border-ink/8 px-8 py-5 text-ink/35 md:block">
          Built for
        </p>
        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
          <div className="flex w-max animate-marquee items-center py-5 hover:[animation-play-state:paused]">
            {[...niches, ...niches].map((niche, i) => (
              <span
                key={i}
                className="display flex items-center gap-6 pr-6 text-[22px] text-ink/65 italic"
                aria-hidden={i >= niches.length}
              >
                {niche}
                <span className="h-4 w-px rounded-full bg-ink/15 not-italic" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
