"use client";

import { useId, useState } from "react";
import { CountrySelect } from "@/components/pricing/CountrySelect";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { countries, findCountry } from "@/data/countries";
import { getPlan, getPrice } from "@/data/plans";
import { formatInr, formatPrice } from "@/lib/utils";

export function GlobalReach() {
  const [code, setCode] = useState(countries[0].code);
  const country = findCountry(code);
  const [fee, setFee] = useState(country.typicalSitePrice);
  const foreignPrice = formatPrice(getPrice(getPlan("auto"), "foreign"));
  // Stable across server and client render; the label needs it to point at the input.
  const feeFieldId = useId();

  const changeCountry = (next: string) => {
    setCode(next);
    setFee(findCountry(next).typicalSitePrice);
  };

  return (
    <section className="overflow-hidden py-24 lg:py-32">
      <Container className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <SectionHeading
            eyebrow="Foreign campaigns"
            title={
              <>
                Your next client could be in <em className="text-primary">Dubai.</em>
              </>
            }
            body="Target businesses in the US, UK, Gulf and beyond. Choose the market, then pay once per batch."
          />
          <dl className="mt-10 grid max-w-md grid-cols-2 gap-px overflow-hidden rounded-2xl bg-ink/8 ring-1 ring-ink/8">
            {countries.slice(0, 4).map((c) => (
              <div key={c.code} className="bg-white px-4 py-3.5">
                <dt className="text-xs text-ink/60">
                  <span className="font-mono">{c.code}</span> · 1 {c.currency}
                </dt>
                <dd className="mt-0.5 font-mono text-sm">≈ {formatInr(c.inrRate)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(155_138_255/0.25),transparent)]"
          />
          <div className="rounded-panel border border-ink/8 bg-white p-6 shadow-soft sm:p-8">
            <p className="eyebrow text-ink/60">Earnings calculator</p>

            <div className="mt-6 space-y-5">
              <CountrySelect value={code} onChange={changeCountry} />

              {/* Explicitly associated rather than wrapping the input: <label>
                  takes phrasing content only, and the currency prefix and the
                  field share a bordered row that needs to be a block. A <div>
                  inside <label> parses as a validation error, and the HTML
                  validator flagged exactly this element. htmlFor/id keeps the
                  association without constraining the layout. */}
              <div>
                <label htmlFor={feeFieldId} className="block text-[13px] font-medium text-ink/70">
                  What you&apos;ll charge per site
                </label>
                <div className="mt-2 flex items-center rounded-2xl border border-ink/10 bg-white px-4 transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
                  <span className="font-mono text-sm text-ink/60">{country.currency}</span>
                  <input
                    id={feeFieldId}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={fee}
                    onChange={(e) => setFee(Math.max(0, Number(e.target.value)))}
                    className="h-13 w-full bg-transparent px-3 text-lg font-medium outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-mist p-5">
              <p className="text-[13px] text-ink/60">One client at this price is roughly</p>
              <p className="display mt-1 text-5xl text-primary">{formatInr(fee * country.inrRate)}</p>
              <p className="mt-2 text-[13px] text-ink/60">
                A foreign batch of 20 pitches costs {foreignPrice}.
              </p>
            </div>

            <Button href="/pricing" variant="dark" arrow className="mt-5 w-full">
              Start a foreign campaign
            </Button>
            <p className="mt-3 text-center text-[11px] text-ink/60">Exchange rates are approximate.</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
