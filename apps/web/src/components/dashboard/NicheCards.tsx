"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, MapPin, Sofa, Sparkles } from "lucide-react";
import { ApiError, nichesApi, type NicheAvailability } from "@/lib/api-client";
import { NICHE_CARDS, SAMPLE_DESIGN, SITE_DESIGNS, UPCOMING_NICHES } from "@/data/niches";
import { sampleDemoUrl } from "@/data/sampleSites";
import { cn } from "@/lib/utils";
import type { SampleSite } from "@/types";

// "What can I pitch near <city>?" — one card per niche that has a ready
// website template, with its sample site and how many businesses without a
// website are nearby. Tapping a card fills the campaign form. The cards are
// known up front and render at once; counts come from a (cached) paid search
// once a city is picked, and never hold the form up.

const POPULAR_CITIES = ["Chennai", "Bengaluru", "Mumbai", "Hyderabad", "Delhi", "Pune", "Coimbatore", "Kochi"];

/** Screenshot of each template's sample site (public/samples). */
const PREVIEW: Record<string, string | undefined> = {
  "dental-clinic": "/samples/dental-clinic-classic.webp",
  clinic: "/samples/clinic-classic.webp",
  restaurant: "/samples/restaurant-studio.webp",
  salon: "/samples/salon-classic.webp",
  gym: "/samples/gym-studio.webp",
  event: "/samples/event-studio.webp",
  coaching: "/samples/coaching-classic.webp",
  interiors: "/samples/interiors-classic.webp",
};

type Result = { configured: boolean; niches: NicheAvailability[] };

// Per page load: flipping back to a city already looked at is instant.
const resultsByCity = new Map<string, Result>();

export function NicheCards({
  city,
  selectedCategory,
  onPick,
  onCity,
}: {
  city: string;
  selectedCategory: string | undefined;
  onPick: (niche: NicheAvailability, city: string) => void;
  onCity: (city: string) => void;
}) {
  const trimmed = city.trim();
  const key = trimmed.toLowerCase();
  const [result, setResult] = useState<Result | null>(() => resultsByCity.get(key) ?? null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (trimmed.length < 3) return;
    const cached = resultsByCity.get(key);
    if (cached) {
      setResult(cached);
      setLoadedKey(key);
      setError(null);
      return;
    }
    // Wait for typing to pause before spending a search.
    const timer = setTimeout(() => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setError(null);
      nichesApi
        .availability(trimmed)
        .then((data) => {
          if (current.signal.aborted) return;
          resultsByCity.set(key, data);
          setResult(data);
          setLoadedKey(key);
        })
        .catch((err: unknown) => {
          if (current.signal.aborted) return;
          setError(err instanceof ApiError ? err.message : "Couldn’t count businesses right now.");
          setLoadedKey(key);
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [key, trimmed]);

  const hasCity = trimmed.length >= 3;
  const counting = hasCity && loadedKey !== key;
  // Counts only apply to the city they were fetched for.
  const counts = new Map((loadedKey === key ? (result?.niches ?? []) : []).map((n) => [n.slug, n]));
  const niches: NicheAvailability[] = NICHE_CARDS.map((card) => counts.get(card.slug) ?? { ...card, available: null, more: false });

  return (
    <section aria-labelledby="niches-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="niches-heading" className="text-sm font-semibold text-dash-foreground">
            Niches with a website ready to pitch
          </h2>
          <p className="text-xs text-dash-muted-foreground">
            {hasCity
              ? `Businesses without a website near ${trimmed} that nobody on PitchMyWeb is already pitching.`
              : "Tap a niche to use its ready-made site. Pick a city to see how many businesses near it have no website."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Popular cities">
        {POPULAR_CITIES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onCity(name)}
            aria-pressed={name.toLowerCase() === key}
            className={cn(
              "inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-xs transition max-md:min-h-11 max-md:px-3.5",
              name.toLowerCase() === key
                ? "border-dash-primary bg-dash-primary text-dash-primary-foreground"
                : "border-dash-border bg-dash-card text-dash-foreground hover:bg-dash-muted",
            )}
          >
            <MapPin className="h-3 w-3" aria-hidden />
            {name}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-dash-muted-foreground">{error}</p>}

      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {niches.map((niche) => {
          const selected = selectedCategory?.trim().toLowerCase() === niche.category.toLowerCase();
          const preview = PREVIEW[niche.template];
          const design = SAMPLE_DESIGN[niche.template] ?? "classic";
          return (
            <li
              key={niche.slug}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-dash-lg border bg-dash-card transition",
                selected ? "border-dash-primary ring-2 ring-dash-primary/30" : "border-dash-border hover:border-dash-primary/50",
              )}
            >
              <button
                type="button"
                onClick={() => onPick(niche, trimmed)}
                aria-pressed={selected}
                className="flex flex-1 flex-col text-left transition active:scale-[0.98]"
              >
                <span className="relative block h-[68px] w-full overflow-hidden bg-dash-muted">
                  {preview ? (
                    <Image src={preview} alt="" fill sizes="(min-width: 1024px) 200px, 45vw" className="object-cover object-top transition group-hover:scale-[1.03]" />
                  ) : (
                    <span className="grid h-full place-items-center text-dash-muted-foreground">
                      <Sofa className="h-6 w-6" aria-hidden />
                    </span>
                  )}
                  {selected && (
                    <span className="absolute top-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-dash-primary text-dash-primary-foreground">
                      <Check className="h-3 w-3" aria-hidden />
                    </span>
                  )}
                </span>
                <span className="flex flex-1 flex-col gap-0.5 px-3 pt-2">
                  <span className="text-[13px] font-semibold text-dash-foreground">{niche.label}</span>
                  <span className="text-[11.5px] leading-snug text-dash-muted-foreground">
                    {counting ? (
                      <span className="inline-block h-3 w-20 animate-pulse rounded bg-dash-muted align-middle" aria-label="Counting" />
                    ) : niche.available === null ? (
                      "4 site designs ready"
                    ) : niche.available === 0 && !niche.more ? (
                      "None free nearby"
                    ) : (
                      <>
                        <span className="font-semibold text-dash-foreground">
                          {niche.available}
                          {niche.more ? "+" : ""}
                        </span>{" "}
                        without a website
                      </>
                    )}
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-1.5 px-3 pb-2.5 text-[11.5px]" role="group" aria-label={`${niche.label}: four sample site designs`}>
                {SITE_DESIGNS.map((option, index) => (
                  <a
                    key={option.key}
                    href={sampleDemoUrl({ template: niche.template as SampleSite["template"], design: option.key })}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${option.label} design`}
                    className={cn(
                      "grid size-7 place-items-center rounded-full border font-medium transition hover:border-dash-primary hover:text-dash-primary",
                      option.key === design ? "border-dash-primary/60 text-dash-primary" : "border-dash-border text-dash-foreground",
                    )}
                  >
                    {index + 1}
                    <span className="sr-only">
                      {option.label} sample site for {niche.label} (opens in a new tab)
                    </span>
                  </a>
                ))}
              </div>
            </li>
          );
        })}
        <li
          className="col-span-full flex flex-col gap-2 rounded-dash-lg border border-dashed border-dash-border bg-dash-muted/40 px-3 py-3"
          data-testid="upcoming-niches"
        >
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-dash-foreground">
            <Sparkles className="h-3.5 w-3.5 text-dash-primary" aria-hidden />
            Coming soon
          </span>
          <ul className="flex flex-wrap gap-1">
            {UPCOMING_NICHES.map((name) => (
              <li key={name} className="rounded-full border border-dash-border bg-dash-card px-2 py-0.5 text-[11px] text-dash-muted-foreground">
                {name}
              </li>
            ))}
          </ul>
          <span className="text-[11px] leading-snug text-dash-muted-foreground">New templates appear here as soon as they are ready.</span>
        </li>
      </ul>
    </section>
  );
}
