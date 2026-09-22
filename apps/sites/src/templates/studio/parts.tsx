import type { DentalContent } from "@pitchmyweb/templates";
import { WhatsAppIcon } from "../dental-clinic/icons";

// Building blocks every studio design shares with the classic layout: the
// "concept" ribbon, the floating WhatsApp button on phones and the map.

/** Colours for the ribbon; a design whose own type has no sans family can pass its font too. */
export type RibbonTone = { background: string; color: string; strong: string; accent: string; fontFamily?: string; fontSize?: number };

/** Top-of-page notice that this is a concept, not the business's own site. */
export function ConceptRibbon({ name, tone }: { name: string; tone: RibbonTone }) {
  return (
    <div
      className="relative z-30 px-4 py-2 text-center font-sans text-[12px] leading-snug tracking-wide break-words"
      style={{ background: tone.background, color: tone.color, fontFamily: tone.fontFamily, fontSize: tone.fontSize }}
    >
      <span aria-hidden className="mr-2 inline-block size-1.5 rounded-full align-middle" style={{ background: tone.accent }} />
      Website concept prepared for{" "}
      <strong className="font-semibold" style={{ color: tone.strong }}>
        {name}
      </strong>{" "}
      · preview
    </div>
  );
}

/** Phone-only WhatsApp button. `fixed` lets the marketing embed hide it. */
export function FloatingWhatsApp({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="fixed right-4 z-50 grid size-14 place-items-center rounded-full bg-whatsapp text-white shadow-float lg:hidden"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <span aria-hidden className="animate-pulse-ring absolute inset-0 rounded-full bg-whatsapp" />
      <WhatsAppIcon className="relative size-7" />
    </a>
  );
}

/** Google map of the business, lazy-loaded. Renders nothing without a location. */
export function MapEmbed({ content, className = "", frameClassName = "" }: { content: DentalContent; className?: string; frameClassName?: string }) {
  if (!content.mapsQuery) return null;
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(content.mapsQuery)}&z=15&output=embed`;
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <iframe
        title={`Map showing ${content.businessName}`}
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className={`absolute inset-0 size-full border-0 ${frameClassName}`}
      />
    </div>
  );
}
