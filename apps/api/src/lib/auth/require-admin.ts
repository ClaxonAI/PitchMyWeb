import type { PrismaClient, User, UserRole } from "@pitchmyweb/db";
import { ForbiddenError, NotFoundError } from "../errors";
import { accessAdminEmail, accessConfig, type AccessRequest } from "./cloudflare-access";
import { requireCurrentUser, type CookieReader } from "./current-user";
import { takeOverUnverifiedAccount } from "./verified-email";

export function isAdminRole(role: UserRole): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

type AdminRequest = CookieReader & AccessRequest;

/**
 * The admin behind this request. With Cloudflare Access configured (always,
 * in production) that is decided by Access alone: a valid token for an
 * address in ADMIN_EMAILS, and no app sign-in. Anyone else gets a 404, so the
 * admin API looks like it isn't there rather than asking them to log in.
 *
 * Without Access configured, production refuses everyone; local development
 * and the test suite fall back to the signed-in user's role.
 */
export async function requireAdmin(db: PrismaClient, request: AdminRequest): Promise<User> {
  const config = accessConfig();
  if (config) {
    const email = await accessAdminEmail(request, config);
    if (!email) throw new NotFoundError("Page", "admin");
    return adminUser(db, email);
  }
  if (process.env.APP_ENV?.trim().toLowerCase() === "production") throw new NotFoundError("Page", "admin");
  const user = await requireCurrentUser(db, request);
  if (!isAdminRole(user.role)) throw new ForbiddenError();
  return user;
}

export async function requireSuperAdmin(db: PrismaClient, request: AdminRequest): Promise<User> {
  const user = await requireAdmin(db, request);
  // An Access-approved admin is always SUPER_ADMIN (adminUser below).
  if (user.role !== "SUPER_ADMIN") throw new ForbiddenError();
  return user;
}

/**
 * The user row that admin actions are recorded against (audit log, coupon
 * creator), made or promoted to SUPER_ADMIN on first use. Cloudflare has
 * verified the address, so an existing password-only account for it is taken
 * over the same way a verified Google sign-in would take it over.
 */
async function adminUser(db: PrismaClient, email: string): Promise<User> {
  const existing = await db.user.findUnique({ where: { email } });
  if (!existing) {
    return db.user.create({ data: { email, role: "SUPER_ADMIN", emailVerifiedAt: new Date() } });
  }
  const takeover = await takeOverUnverifiedAccount(db, existing);
  if (existing.role === "SUPER_ADMIN" && !existing.suspendedAt && Object.keys(takeover).length === 0) return existing;
  return db.user.update({ where: { id: existing.id }, data: { ...takeover, role: "SUPER_ADMIN", suspendedAt: null } });
}
