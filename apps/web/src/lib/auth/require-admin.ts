import { redirect } from "next/navigation";
import { requireSession, type SessionUser } from "./require-session";

export function isAdminRole(role: SessionUser["role"]): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export async function requireAdminSession(): Promise<SessionUser> {
  const user = await requireSession();
  if (!isAdminRole(user.role)) redirect("/dashboard");
  return user;
}
