import type { ComponentType } from "react";
import type { DentalContent, PreviewDesign, PreviewTemplateCode } from "@pitchmyweb/templates";
import { hasDesign } from "@pitchmyweb/templates";
import { DentalClinicSite } from "./dental-clinic/DentalClinicSite";
import { DentalAtelier } from "./atelier/DentalAtelier";
import { DentalEditorial } from "./editorial/DentalEditorial";
import { ClinicStudio } from "./studio/ClinicStudio";
import { CoachingStudio } from "./studio/CoachingStudio";
import { DentalStudio } from "./studio/DentalStudio";
import { EventStudio } from "./studio/EventStudio";
import { GymStudio } from "./studio/GymStudio";
import { InteriorsStudio } from "./studio/InteriorsStudio";
import { RestaurantStudio } from "./studio/RestaurantStudio";
import { SalonStudio } from "./studio/SalonStudio";

type Design = ComponentType<{ content: DentalContent }>;

// Every standalone design, by template. `classic` is the shared layout
// (DentalClinicSite, themed per vertical) and is the fallback for content
// stored before designs existed, or naming a design a template lacks.
const DESIGNS: { [T in PreviewTemplateCode]?: Partial<Record<Exclude<PreviewDesign, "classic">, Design>> } = {
  "dental-clinic": { studio: DentalStudio, editorial: DentalEditorial, atelier: DentalAtelier },
  clinic: { studio: ClinicStudio },
  restaurant: { studio: RestaurantStudio },
  salon: { studio: SalonStudio },
  gym: { studio: GymStudio },
  interiors: { studio: InteriorsStudio },
  event: { studio: EventStudio },
  coaching: { studio: CoachingStudio },
};

/** The component that draws this content, or null for the classic layout. */
export function designComponent(content: DentalContent): Design | null {
  const design = content.design;
  if (!design || design === "classic" || !hasDesign(content.template, design)) return null;
  return DESIGNS[content.template]?.[design] ?? null;
}

export function PreviewSite({ content }: { content: DentalContent }) {
  const Site = designComponent(content);
  return Site ? <Site content={content} /> : <DentalClinicSite content={content} />;
}
