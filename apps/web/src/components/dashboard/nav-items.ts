import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Megaphone, MessageCircle, Search, Users } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; stub?: boolean };

// Single source of truth for the sidebar's URL scheme — flat, not nested
// under /dashboard, matching the one pre-existing page's own precedent
// (/dashboard/whatsapp -> /whatsapp) rather than mixing conventions.
//
// Kept to the five places a user actually works from. Websites, pitches and
// activity are reached from a campaign or lead; Profile and Settings live in
// the avatar menu (Topbar). Those pages still exist at their URLs.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
];
