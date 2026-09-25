import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Megaphone, MessageCircle, Search } from "lucide-react";

/**
 * `also`: other URL prefixes that live inside this module, so its sidebar
 * entry stays highlighted there (Leads, Websites, Pitches and Activity are
 * tabs inside Campaigns — see WorkTabs).
 */
export type NavItem = { href: string; label: string; icon: LucideIcon; stub?: boolean; also?: string[] };

// Single source of truth for the sidebar's URL scheme — flat, not nested
// under /dashboard, matching the one pre-existing page's own precedent
// (/dashboard/whatsapp -> /whatsapp) rather than mixing conventions.
//
// Four modules, deliberately. Everything else lives inside one of them:
// leads, websites, pitches and activity are tabs in Campaigns; Profile and
// Settings are in the avatar menu (Topbar). Those pages keep their URLs.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "New campaign", icon: Search },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone, also: ["/leads", "/websites", "/pitches", "/activity"] },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
];

/** Whether `pathname` belongs to this item (its own URL, a sub-page, or one of `also`). */
export function isNavItemActive(item: { href: string; also?: string[] }, pathname: string | null): boolean {
  if (!pathname) return false;
  if (item.href === "/admin" || item.href === "/dashboard") return pathname === item.href;
  return [item.href, ...(item.also ?? [])].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
