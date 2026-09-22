import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/require-session";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · PitchMyWeb" },
  // Kept crawlable in robots.txt on purpose (see app/robots.ts) so a crawler
  // reaching these URLs actually reads this directive rather than guessing
  // from an inbound link. Nothing behind sign-in belongs in an index.
  robots: { index: false, follow: false },
};

// Every request into this subtree depends on the session cookie, so it can
// never be static — same reasoning the original /dashboard/whatsapp page
// documented for itself.
export const dynamic = "force-dynamic";

// URL scheme for everything under this group (flat, not nested under
// /dashboard — matching the one page that predates this rebuild,
// /dashboard/whatsapp -> /whatsapp): /dashboard (home), /discover, /leads,
// /leads/[id], /campaigns, /campaigns/[id], /websites, /websites/[id],
// /whatsapp, /activity, /pitches, /billing, /settings, /profile.
//
// The session check lives here, once, rather than duplicated per page:
// every page below is a descendant of this layout, and Next re-runs a
// force-dynamic, cookies()-dependent server component on every request
// regardless of shared-layout optimizations for client-side navigation —
// there is no "runs once" caching gap for a null/expired session to slip
// through.
export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireSession();
  return <DashboardShell user={user}>{children}</DashboardShell>;
}
