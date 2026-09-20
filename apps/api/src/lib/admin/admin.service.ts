import type { Campaign, Prisma, PrismaClient, User, UserRole } from "@pitchmyweb/db";
import type { PaginatedResult } from "../campaigns/campaign.service";
import { ForbiddenError, NotFoundError } from "../errors";
import { deleteSessionsForUser } from "../auth/session";
import { writeAuditLog } from "./audit";
import type { AdminAuditListQuery, AdminCampaignListQuery, AdminPitchListQuery, AdminUserListQuery } from "../validation/admin";
import type { AdminCreateCouponBody } from "../validation/admin";

type Db = PrismaClient;

const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  planId: true,
  suspendedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AdminUserSummary = Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;

export type PlatformOverview = {
  users: number;
  admins: number;
  suspendedUsers: number;
  campaigns: number;
  leads: number;
  pendingDuplicates: number;
  paidOrders: number;
};

export async function getPlatformOverview(db: Db): Promise<PlatformOverview> {
  const [users, admins, suspendedUsers, campaigns, leads, pendingDuplicates, paidOrders] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } }),
    db.user.count({ where: { suspendedAt: { not: null } } }),
    db.campaign.count(),
    db.lead.count(),
    db.possibleDuplicate.count({ where: { status: "PENDING" } }),
    db.order.count({ where: { status: "PAID" } }),
  ]);
  return { users, admins, suspendedUsers, campaigns, leads, pendingDuplicates, paidOrders };
}

export async function listUsers(db: Db, query: AdminUserListQuery): Promise<PaginatedResult<AdminUserSummary>> {
  const where: Prisma.UserWhereInput = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.suspended === true ? { suspendedAt: { not: null } } : {}),
    ...(query.suspended === false ? { suspendedAt: null } : {}),
    ...(query.q
      ? {
          OR: [{ email: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      select: USER_PUBLIC_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.user.count({ where }),
  ]);

  return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export type AdminUserDetail = AdminUserSummary & {
  usage: { campaigns: number; leads: number; pitches: number; paidOrders: number };
};

export async function getUserDetail(db: Db, userId: string): Promise<AdminUserDetail> {
  const user = await db.user.findUnique({ where: { id: userId }, select: USER_PUBLIC_SELECT });
  if (!user) throw new NotFoundError("User", userId);

  const [campaigns, leads, pitches, paidOrders] = await Promise.all([
    db.campaign.count({ where: { userId } }),
    db.lead.count({ where: { campaign: { userId } } }),
    db.pitch.count({ where: { lead: { campaign: { userId } } } }),
    db.order.count({ where: { userId, status: "PAID" } }),
  ]);

  return { ...user, usage: { campaigns, leads, pitches, paidOrders } };
}

export type AdminPitchRow = Prisma.PitchGetPayload<{
  include: { lead: { include: { business: true; campaign: { select: { id: true; name: true; user: { select: { id: true; email: true } } } } } } };
}>;

export async function listPlatformPitches(db: Db, query: AdminPitchListQuery): Promise<PaginatedResult<AdminPitchRow>> {
  const where: Prisma.PitchWhereInput = query.userId ? { lead: { campaign: { userId: query.userId } } } : {};
  const [items, total] = await Promise.all([
    db.pitch.findMany({
      where,
      include: { lead: { include: { business: true, campaign: { select: { id: true, name: true, user: { select: { id: true, email: true } } } } } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.pitch.count({ where }),
  ]);
  return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function listCoupons(db: Db) {
  return db.coupon.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createCoupon(db: Db, actor: User, input: AdminCreateCouponBody) {
  if (actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const coupon = await db.coupon.create({
    data: {
      code: input.code.toUpperCase(),
      discountPercent: input.discountPercent,
      maxRedemptions: input.maxRedemptions ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  await writeAuditLog(db, { actorId: actor.id, action: "COUPON_CREATED", targetType: "Coupon", targetId: coupon.id, metadata: { code: coupon.code } });
  return coupon;
}

function assertCanActOnTarget(actor: User, target: Pick<User, "id" | "role">): void {
  if (actor.id === target.id) {
    throw new ForbiddenError("You cannot change your own account from here");
  }
  if (target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only a super admin can change a super admin");
  }
}

export async function suspendUser(db: Db, actor: User, userId: string): Promise<AdminUserSummary> {
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw new NotFoundError("User", userId);
  assertCanActOnTarget(actor, target);

  const updated = await db.user.update({
    where: { id: userId },
    data: { suspendedAt: new Date() },
    select: USER_PUBLIC_SELECT,
  });
  await deleteSessionsForUser(db, userId);
  await writeAuditLog(db, { actorId: actor.id, action: "USER_SUSPENDED", targetType: "User", targetId: userId });
  return updated;
}

export async function restoreUser(db: Db, actor: User, userId: string): Promise<AdminUserSummary> {
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw new NotFoundError("User", userId);
  assertCanActOnTarget(actor, target);

  const updated = await db.user.update({
    where: { id: userId },
    data: { suspendedAt: null },
    select: USER_PUBLIC_SELECT,
  });
  await writeAuditLog(db, { actorId: actor.id, action: "USER_RESTORED", targetType: "User", targetId: userId });
  return updated;
}

export async function setUserPlan(db: Db, actor: User, userId: string, planId: string | null): Promise<AdminUserSummary> {
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw new NotFoundError("User", userId);
  assertCanActOnTarget(actor, target);

  const updated = await db.user.update({
    where: { id: userId },
    data: { planId },
    select: USER_PUBLIC_SELECT,
  });
  await writeAuditLog(db, {
    actorId: actor.id,
    action: "USER_PLAN_CHANGED",
    targetType: "User",
    targetId: userId,
    metadata: { planId },
  });
  return updated;
}

export async function setUserRole(db: Db, actor: User, userId: string, role: UserRole): Promise<AdminUserSummary> {
  if (actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw new NotFoundError("User", userId);
  assertCanActOnTarget(actor, target);

  const updated = await db.user.update({
    where: { id: userId },
    data: { role },
    select: USER_PUBLIC_SELECT,
  });
  await writeAuditLog(db, {
    actorId: actor.id,
    action: "USER_ROLE_CHANGED",
    targetType: "User",
    targetId: userId,
    metadata: { role },
  });
  return updated;
}

export type AdminCampaignRow = Campaign & { user: { id: string; email: string } };

export async function listPlatformCampaigns(db: Db, query: AdminCampaignListQuery): Promise<PaginatedResult<AdminCampaignRow>> {
  const where: Prisma.CampaignWhereInput = query.userId ? { userId: query.userId } : {};
  const [items, total] = await Promise.all([
    db.campaign.findMany({
      where,
      include: { user: { select: { id: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.campaign.count({ where }),
  ]);
  return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function listAuditLogs(db: Db, query: AdminAuditListQuery) {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
  };
  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.auditLog.count({ where }),
  ]);
  return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}
