"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_ITEMS } from "./nav-items";
import { LogoMark } from "@/components/layout/Logo";

export function AdminSidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-dash-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-dash-primary/10 text-dash-primary" : "text-dash-muted-foreground hover:bg-dash-accent hover:text-dash-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-dash-border bg-dash-card md:flex">
      <div className="flex h-14 items-center border-b border-dash-border px-4">
        <LogoMark className="size-8" />
        <span className="display text-base text-dash-foreground">Admin</span>
      </div>
      <AdminSidebarNav />
      <Link
        href="/dashboard"
        className="flex h-11 items-center justify-center gap-2 border-t border-dash-border text-xs text-dash-muted-foreground transition-colors hover:bg-dash-accent hover:text-dash-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Customer app
      </Link>
    </aside>
  );
}
