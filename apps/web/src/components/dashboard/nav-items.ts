import type { LucideIcon } from "lucide-react";
import { Activity, CreditCard, Globe, LayoutDashboard, Megaphone, MessageCircle, MessageSquareText, Search, Settings, UserCircle, Users } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; stub?: boolean };

// Single source of truth for the sidebar's URL scheme — flat, not nested
// under /dashboard, matching the one pre-existing page's own precedent
// (/dashboard/whatsapp -> /whatsapp) rather than mixing conventions.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/websites", label: "Websites", icon: Globe },
  { href: "/pitches", label: "Pitches", icon: MessageSquareText },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/billing", label: "Billing", icon: CreditCard, stub: true },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/profile", label: "Profile", icon: UserCircle },
];
