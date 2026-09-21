import type { DentalContent, DentalTheme, PreviewTemplateCode } from "@pitchmyweb/templates";
import { hasStudioDesign } from "@pitchmyweb/templates";

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

const STUDIO: Record<Exclude<PreviewTemplateCode, "dental-clinic">, string> = {
  clinic: "#f3f0e9",
  restaurant: "#f2eddf",
  salon: "#d9d2ec",
  gym: "#101111",
  interiors: "#ffffff",
  event: "#1b1718",
  coaching: "#e3e9df",
};

function studioTemplate(content: DentalContent): Exclude<PreviewTemplateCode, "dental-clinic"> | null {
  return content.design === "studio" && content.template !== "dental-clinic" && hasStudioDesign(content.template) ? content.template : null;
}

export function previewThemeColor(content: DentalContent): string {
  const studio = studioTemplate(content);
  return studio ? STUDIO[studio] : CLASSIC[content.theme];
}

// Link-preview card colours (the og:image): each design's deepest brand
// colour behind light text, with its accent for the small details.

export type CardColors = { background: string; color: string; accent: string };

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
  const studio = studioTemplate(content);
  return studio ? STUDIO_CARD[studio] : CLASSIC_CARD[content.theme];
}
