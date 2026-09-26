import type { ComponentType } from "react";
import type { DentalContent, PreviewDesign, PreviewTemplateCode } from "@pitchmyweb/templates";
import { hasDesign } from "@pitchmyweb/templates";
import { DentalClinicSite } from "./dental-clinic/DentalClinicSite";
import { ClinicAtelier } from "./atelier/ClinicAtelier";
import { CoachingAtelier } from "./atelier/CoachingAtelier";
import { EventAtelier } from "./atelier/EventAtelier";
import { GymAtelier } from "./atelier/GymAtelier";
import { InteriorsAtelier } from "./atelier/InteriorsAtelier";
import { DentalAtelier } from "./atelier/DentalAtelier";
import { RestaurantAtelier } from "./atelier/RestaurantAtelier";
import { SalonAtelier } from "./atelier/SalonAtelier";
import { ClinicEditorial } from "./editorial/ClinicEditorial";
import { CoachingEditorial } from "./editorial/CoachingEditorial";
import { EventEditorial } from "./editorial/EventEditorial";
import { GymEditorial } from "./editorial/GymEditorial";
import { InteriorsEditorial } from "./editorial/InteriorsEditorial";
import { DentalEditorial } from "./editorial/DentalEditorial";
import { RestaurantEditorial } from "./editorial/RestaurantEditorial";
import { SalonEditorial } from "./editorial/SalonEditorial";
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
  clinic: { studio: ClinicStudio, editorial: ClinicEditorial, atelier: ClinicAtelier },
  restaurant: { studio: RestaurantStudio, editorial: RestaurantEditorial, atelier: RestaurantAtelier },
  salon: { studio: SalonStudio, editorial: SalonEditorial, atelier: SalonAtelier },
  gym: { studio: GymStudio, editorial: GymEditorial, atelier: GymAtelier },
  interiors: { studio: InteriorsStudio, editorial: InteriorsEditorial, atelier: InteriorsAtelier },
  event: { studio: EventStudio, editorial: EventEditorial, atelier: EventAtelier },
  coaching: { studio: CoachingStudio, editorial: CoachingEditorial, atelier: CoachingAtelier },
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
