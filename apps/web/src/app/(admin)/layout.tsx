import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { SessionUser } from "@/lib/auth/require-session";
import { adminFetch } from "@/lib/admin-fetch";
import { noIndex } from "@/lib/seo/metadata";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · PitchMyWeb" }, ...noIndex };
export const dynamic = "force-dynamic";

// Cloudflare Access guards /admin: the API checks its token and the allowed
// email, with no app sign-in. For anyone else /api/admin/me is a 404, and so
// is this page, rather than a sign-in form that says an admin portal exists.
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const admin = await adminFetch<SessionUser>("/api/admin/me");
  if (!admin) notFound();
  return <AdminShell user={admin}>{children}</AdminShell>;
}
