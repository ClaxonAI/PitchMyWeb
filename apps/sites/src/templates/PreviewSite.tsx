import type { DentalContent } from "@pitchmyweb/templates";
import { hasStudioDesign } from "@pitchmyweb/templates";
import { DentalClinicSite } from "./dental-clinic/DentalClinicSite";
import { ClinicStudio } from "./studio/ClinicStudio";
import { CoachingStudio } from "./studio/CoachingStudio";
import { EventStudio } from "./studio/EventStudio";
import { GymStudio } from "./studio/GymStudio";
import { InteriorsStudio } from "./studio/InteriorsStudio";
import { RestaurantStudio } from "./studio/RestaurantStudio";
import { SalonStudio } from "./studio/SalonStudio";

// Renders a preview in whichever design its content was built with. `classic`
// (or no design, for previews stored before designs existed) is the shared
// layout; `studio` is the standalone per-vertical design.
export function PreviewSite({ content }: { content: DentalContent }) {
  if (content.design === "studio" && hasStudioDesign(content.template)) {
    switch (content.template) {
      case "clinic":
        return <ClinicStudio content={content} />;
      case "restaurant":
        return <RestaurantStudio content={content} />;
      case "salon":
        return <SalonStudio content={content} />;
      case "gym":
        return <GymStudio content={content} />;
      case "interiors":
        return <InteriorsStudio content={content} />;
      case "event":
        return <EventStudio content={content} />;
      case "coaching":
        return <CoachingStudio content={content} />;
    }
  }
  return <DentalClinicSite content={content} />;
}
