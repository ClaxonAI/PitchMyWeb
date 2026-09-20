import { z } from "zod";
import { paginationQuerySchema } from "./common";

export const userRoleSchema = z.enum(["USER", "ADMIN", "SUPER_ADMIN"]);

export const adminUserListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).optional(),
  role: userRoleSchema.optional(),
  suspended: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export const adminPlanSchema = z.enum(["auto", "direct"]);

export const adminSetPlanBodySchema = z
  .object({
    planId: adminPlanSchema.nullable(),
  })
  .strict();

export type AdminSetPlanBody = z.infer<typeof adminSetPlanBodySchema>;

export const adminSetRoleBodySchema = z
  .object({
    role: userRoleSchema,
  })
  .strict();

export type AdminSetRoleBody = z.infer<typeof adminSetRoleBodySchema>;

export const adminCreateCouponBodySchema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/),
  discountPercent: z.number().int().min(1).max(100),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).strict();

export type AdminCreateCouponBody = z.infer<typeof adminCreateCouponBodySchema>;

export const adminAuditListQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().min(1).optional(),
  actorId: z.string().trim().min(1).optional(),
});

export type AdminAuditListQuery = z.infer<typeof adminAuditListQuerySchema>;

export const adminCampaignListQuerySchema = paginationQuerySchema.extend({
  userId: z.string().trim().min(1).optional(),
});

export type AdminCampaignListQuery = z.infer<typeof adminCampaignListQuerySchema>;

export const adminPitchListQuerySchema = paginationQuerySchema.extend({
  userId: z.string().trim().min(1).optional(),
});

export type AdminPitchListQuery = z.infer<typeof adminPitchListQuerySchema>;
