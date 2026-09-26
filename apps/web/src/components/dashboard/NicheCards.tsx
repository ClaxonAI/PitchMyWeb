"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, MapPin, Sofa } from "lucide-react";
import { ApiError, nichesApi, type NicheAvailability } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// "What can I pitch near <city>?" — one card per niche that has a ready
// website template, with how many businesses without a website are nearby.
// Tapping a card fills the campaign form. Counts come from a (cached) paid
// search, so they load after the cards and never hold the form up.

const POPULAR_CITIES = ["Chennai", "Bengaluru", "Mumbai", "Hyderabad", "Delhi", "Pune", "Coimbatore", "Kochi"];

/** Screenshot of each template's sample site (public/samples). Interiors has none yet. */
const PREVIEW: Record<string, string | undefined> = {
  "dental-clinic": "/samples/dental-clinic-classic.webp",
  clinic: "/samples/dental-clinic-classic.webp",
  restaurant: "/samples/restaurant-studio.webp",
  salon: "/samples/salon-classic.webp",
  gym: "/samples/gym-studio.webp",
  event: "/samples/event-studio.webp",
  coaching: "/samples/coaching-classic.webp",
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

  const counting = trimmed.length >= 3 && loadedKey !== key;
  const niches = result?.niches ?? null;

  return (
    <section aria-labelledby="niches-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="niches-heading" className="text-sm font-semibold text-dash-foreground">
            Niches with a website ready to pitch
          </h2>
          <p className="text-xs text-dash-muted-foreground">
            {trimmed.length >= 3
              ? `Businesses without a website near ${trimmed} that nobody on PitchMyWeb is already pitching.`
              : "Pick a city to see how many businesses without a website are near it."}
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
              "inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-xs transition",
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
        {(niches ?? Array.from({ length: 8 }, () => null)).map((niche, index) => {
          if (!niche) {
            return <li key={index} className="h-[132px] animate-pulse rounded-dash-lg border border-dash-border bg-dash-muted" aria-hidden />;
          }
          const selected = selectedCategory?.trim().toLowerCase() === niche.category.toLowerCase();
          const preview = PREVIEW[niche.template];
          return (
            <li key={niche.slug}>
              <button
                type="button"
                onClick={() => onPick(niche, trimmed)}
                aria-pressed={selected}
                className={cn(
                  "group flex h-full w-full flex-col overflow-hidden rounded-dash-lg border bg-dash-card text-left transition active:scale-[0.98]",
                  selected ? "border-dash-primary ring-2 ring-dash-primary/30" : "border-dash-border hover:border-dash-primary/50",
                )}
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
                <span className="flex flex-1 flex-col gap-0.5 px-3 py-2">
                  <span className="text-[13px] font-semibold text-dash-foreground">{niche.label}</span>
                  <span className="text-[11.5px] leading-snug text-dash-muted-foreground">
                    {counting ? (
                      <span className="inline-block h-3 w-20 animate-pulse rounded bg-dash-muted align-middle" aria-label="Counting" />
                    ) : niche.available === null ? (
                      "Site template ready"
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
