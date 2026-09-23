import type { LucideIcon } from "lucide-react";
import { CreditCard, Globe, LayoutDashboard, Megaphone, Settings } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; stub?: boolean };

// Single source of truth for the sidebar's URL scheme — flat, not nested
// under /dashboard, matching the one pre-existing page's own precedent
// (/dashboard/whatsapp -> /whatsapp) rather than mixing conventions.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/websites", label: "Websites", icon: Globe },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];
