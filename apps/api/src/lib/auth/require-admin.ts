import type { PrismaClient, User, UserRole } from "@pitchmyweb/db";
import { ForbiddenError } from "../errors";
import { requireCurrentUser, type CookieReader } from "./current-user";

export function isAdminRole(role: UserRole): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export async function requireAdmin(db: PrismaClient, request: CookieReader): Promise<User> {
  const user = await requireCurrentUser(db, request);
  if (!isAdminRole(user.role)) throw new ForbiddenError();
  return user;
}

export async function requireSuperAdmin(db: PrismaClient, request: CookieReader): Promise<User> {
  const user = await requireCurrentUser(db, request);
  if (user.role !== "SUPER_ADMIN") throw new ForbiddenError();
  return user;
}
