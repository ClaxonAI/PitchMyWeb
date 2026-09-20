import type { LucideIcon } from "lucide-react";
import { FileSearch, LayoutDashboard, Percent, ScrollText, Settings, Shield, Users } from "lucide-react";

export type AdminNavItem = { href: string; label: string; icon: LucideIcon };

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/pitches", label: "Pitches", icon: Shield },
  { href: "/admin/coupons", label: "Coupons", icon: Percent },
  { href: "/admin/duplicates", label: "Duplicates", icon: FileSearch },
  { href: "/admin/campaigns", label: "Campaigns", icon: Shield },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];
