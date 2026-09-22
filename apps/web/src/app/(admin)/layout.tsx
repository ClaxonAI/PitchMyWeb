import type { Metadata } from "next";
import { isAdminRole } from "@/lib/auth/require-admin";
import { requireSession } from "@/lib/auth/require-session";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · PitchMyWeb" },
  // Kept crawlable in robots.txt on purpose (see app/robots.ts) so a crawler
  // reaching these URLs actually reads this directive rather than guessing
  // from an inbound link. Nothing behind sign-in belongs in an index.
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireSession();
  if (!isAdminRole(user.role)) {
    return (
      <DashboardShell user={user}>
        <AdminAccessDenied user={user} />
      </DashboardShell>
    );
  }
  return <AdminShell user={user}>{children}</AdminShell>;
}
