import type { DentalContent, DentalTheme, PreviewDesign, PreviewTemplateCode } from "@pitchmyweb/templates";
import { hasDesign } from "@pitchmyweb/templates";

// The colour a phone's browser chrome takes for a preview (<meta
// name="theme-color">): the page/header colour of whichever design is shown,
// so the address bar blends into the site instead of sitting on it.

const CLASSIC: Record<DentalTheme, string> = {
  teal: "#f6f2ea",
  sage: "#f4f3ec",
  navy: "#f5f4f0",
  amber: "#f7f1e6",
  violet: "#f6f3fb",
  ember: "#111111",
  stone: "#f4f1ec",
  wine: "#f7f0ee",
  ink: "#eef2f6",
};

export type CardColors = { background: string; color: string; accent: string };
type Standalone = Exclude<PreviewDesign, "classic">;
type Surfaces<T> = { [K in PreviewTemplateCode]?: Partial<Record<Standalone, T>> };

const STUDIO: Record<Exclude<PreviewTemplateCode, "dental-clinic">, string> = {
  clinic: "#f3f0e9",
  restaurant: "#f2eddf",
  salon: "#d9d2ec",
  gym: "#101111",
  interiors: "#ffffff",
  event: "#1b1718",
  coaching: "#e3e9df",
};

// Designs beyond the studio set: page colour and link-preview card, per template.
const EXTRA_THEME: Surfaces<string> = {
  "dental-clinic": { studio: "#f4f7f6", editorial: "#f3efe6", atelier: "#0f1a1d" },
  clinic: { editorial: "#fbfbf9", atelier: "#efe9df" },
  restaurant: { editorial: "#f7f1e3", atelier: "#141110" },
  salon: { editorial: "#f6e3dc", atelier: "#2b1a2e" },
};
const EXTRA_CARD: Surfaces<CardColors> = {
  "dental-clinic": {
    studio: { background: "#0c3b4a", color: "#f4f7f6", accent: "#7fd8c9" },
    editorial: { background: "#1f2a2e", color: "#f3efe6", accent: "#c8553d" },
    atelier: { background: "#0f1a1d", color: "#ece6da", accent: "#c9a96e" },
  },
  clinic: {
    editorial: { background: "#0b0b0c", color: "#fbfbf9", accent: "#5b7cff" },
    atelier: { background: "#33443a", color: "#f6f1e8", accent: "#d69a78" },
  },
  restaurant: {
    editorial: { background: "#7a2020", color: "#f7f1e3", accent: "#f1c98d" },
    atelier: { background: "#141110", color: "#f1e6d6", accent: "#e58a4e" },
  },
  salon: {
    editorial: { background: "#121012", color: "#f6e3dc", accent: "#d0342c" },
    atelier: { background: "#2b1a2e", color: "#f5ece6", accent: "#e0ae98" },
  },
};

/** The standalone design on screen, or null for the classic layout. */
function standalone(content: DentalContent): Standalone | null {
  const design = content.design;
  return design && design !== "classic" && hasDesign(content.template, design) ? design : null;
}

export function previewThemeColor(content: DentalContent): string {
  const design = standalone(content);
  if (!design) return CLASSIC[content.theme];
  const extra = EXTRA_THEME[content.template]?.[design];
  if (extra) return extra;
  return content.template !== "dental-clinic" && design === "studio" ? STUDIO[content.template] : CLASSIC[content.theme];
}

// Link-preview card colours (the og:image): each design's deepest brand
// colour behind light text, with its accent for the small details.


const CLASSIC_CARD: Record<DentalTheme, CardColors> = {
  teal: { background: "#0a3f3c", color: "#fffdf8", accent: "#e39266" },
  sage: { background: "#2a4b37", color: "#fdfcf7", accent: "#c98556" },
  navy: { background: "#152a47", color: "#fefdfa", accent: "#d6a045" },
  amber: { background: "#6e3010", color: "#fffaf2", accent: "#e0a060" },
  violet: { background: "#5b21b6", color: "#fdfbff", accent: "#c4b5fd" },
  ember: { background: "#111111", color: "#f4f1ea", accent: "#ff7a00" },
  stone: { background: "#3d372f", color: "#fbf9f5", accent: "#c9a383" },
  wine: { background: "#541f28", color: "#fffaf9", accent: "#c9a27a" },
  ink: { background: "#12263f", color: "#f7f9fb", accent: "#6aa6ff" },
};

const STUDIO_CARD: Record<Exclude<PreviewTemplateCode, "dental-clinic">, CardColors> = {
  clinic: { background: "#141312", color: "#ffffff", accent: "#e0737a" },
  restaurant: { background: "#21332d", color: "#f2eddf", accent: "#e0806f" },
  salon: { background: "#512f55", color: "#f7f5ef", accent: "#d8ff4f" },
  gym: { background: "#101111", color: "#f4f4ee", accent: "#d7ff38" },
  interiors: { background: "#0d1117", color: "#ffffff", accent: "#f0842a" },
  event: { background: "#321426", color: "#f0ded0", accent: "#c9a35c" },
  coaching: { background: "#152028", color: "#f5f2ea", accent: "#f15335" },
};

export function previewCardColors(content: DentalContent): CardColors {
  const design = standalone(content);
  if (!design) return CLASSIC_CARD[content.theme];
  const extra = EXTRA_CARD[content.template]?.[design];
  if (extra) return extra;
  return content.template !== "dental-clinic" && design === "studio" ? STUDIO_CARD[content.template] : CLASSIC_CARD[content.theme];
}
