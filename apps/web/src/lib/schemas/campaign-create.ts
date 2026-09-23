import { z } from "zod";

// Hand-mirrored from apps/api/src/lib/validation/campaign.ts's
// campaignCreateSchema — there is no shared schema package bridging the two
// apps, so this is a deliberate duplication of *shape*, not the same Zod
// object. Keep in sync manually if the API schema changes; a mismatch here
// only ever produces an overly-strict client-side validation error (the API
// is still the source of truth and re-validates independently), never a bad
// write.
export const campaignFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  market: z.enum(["india", "foreign"]),
  location: z.string().trim().min(1, "Location is required"),
  category: z.string().trim().min(1, "Category is required"),
  radius: z.coerce.number().positive().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  minReviews: z.coerce.number().int().min(0).optional(),
  websiteRequirement: z.enum(["ANY", "WITH_WEBSITE", "WITHOUT_WEBSITE"]),
  targetCount: z.coerce.number().int().min(1).max(200),
  messageTemplate: z.string().trim().min(1, "Message is required").max(1000, "Message is too long"),
});

export type CampaignFormValues = z.infer<typeof campaignFormSchema>;
