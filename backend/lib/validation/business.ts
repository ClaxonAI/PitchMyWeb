import { z } from "zod";
import { paginationQuerySchema } from "./common";

// Raw record coming from a LeadProvider (backend_tasks.md section 22),
// before normalization. Provider responses are external/untrusted input
// (Rule 5) so every field is validated before it reaches normalization.
export const businessProviderInputSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  category: z.string().trim().min(1, "category is required"),
  address: z.string().trim().min(1).optional().nullable(),
  city: z.string().trim().min(1).optional().nullable(),
  phone: z.string().trim().min(1).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  website: z.string().trim().url().optional().nullable(),
  instagram: z.string().trim().min(1).optional().nullable(),
  facebook: z.string().trim().min(1).optional().nullable(),
  rating: z.number().min(0).max(5).optional().nullable(),
  reviewCount: z.number().int().min(0).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  source: z.string().trim().min(1, "source is required"),
  externalId: z.string().trim().min(1).optional().nullable(),
});

export type BusinessProviderInput = z.infer<typeof businessProviderInputSchema>;

export const businessListQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

export type BusinessListQuery = z.infer<typeof businessListQuerySchema>;
