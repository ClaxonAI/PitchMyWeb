import type { LucideIcon } from "lucide-react";
import { Globe, LayoutDashboard, Megaphone, Settings } from "lucide-react";

/**
 * `also`: other URL prefixes that live inside this module, so its sidebar
 * entry stays highlighted there (see SectionTabs for the tabs each module
 * shows).
 */
export type NavItem = { href: string; label: string; icon: LucideIcon; stub?: boolean; also?: string[] };

// Single source of truth for the sidebar's URL scheme — flat, not nested
// under /dashboard, matching the one pre-existing page's own precedent
// (/dashboard/whatsapp -> /whatsapp) rather than mixing conventions.
//
// Four modules. Everything else is a tab inside one of them:
//   Campaigns — the campaign list, New campaign (/campaigns/new), leads,
//               pitches and activity.
//   Settings  — profile, appearance and password; the linked WhatsApp;
//               billing.
// Every page keeps its URL.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone, also: ["/discover", "/leads", "/pitches", "/activity"] },
  { href: "/websites", label: "Websites", icon: Globe },
  { href: "/settings", label: "Settings", icon: Settings, also: ["/profile", "/whatsapp", "/billing"] },
];

/** Whether `pathname` belongs to this item (its own URL, a sub-page, or one of `also`). */
export function isNavItemActive(item: { href: string; also?: string[] }, pathname: string | null): boolean {
  if (!pathname) return false;
  if (item.href === "/admin" || item.href === "/dashboard") return pathname === item.href;
  return [item.href, ...(item.also ?? [])].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
