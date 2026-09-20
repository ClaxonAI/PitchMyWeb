"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/stores/ui-store";
import { NAV_ITEMS } from "./nav-items";
import { ADMIN_NAV_ITEMS } from "@/components/admin/nav-items";
import { Badge } from "@/components/dashboard-ui/badge";
import { LogoMark } from "@/components/layout/Logo";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = pathname?.startsWith("/admin") ? ADMIN_NAV_ITEMS : NAV_ITEMS;
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
      {items.map((item) => {
        const active = item.href === "/admin" || item.href === "/dashboard" ? pathname === item.href : pathname === item.href || pathname?.startsWith(`${item.href}/`);
        const stub = "stub" in item && Boolean(item.stub);
        return (
          <Link
            key={item.href}
            href={item.href}
            onMouseEnter={() => router.prefetch(item.href)}
            onFocus={() => router.prefetch(item.href)}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-dash-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-dash-primary/10 text-dash-primary" : "text-dash-muted-foreground hover:bg-dash-accent hover:text-dash-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
            {stub && (
              <Badge variant="muted" className="ml-auto shrink-0 text-[10px]">
                soon
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const router = useRouter();

  return (
    <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-dash-border bg-dash-card md:flex", sidebarCollapsed ? "w-16" : "w-60")}>
      <div className="flex h-14 items-center gap-2 border-b border-dash-border px-4">
        <LogoMark className="size-8 shrink-0" />
        {!sidebarCollapsed && <span className="display text-base text-dash-foreground">PitchMyWeb</span>}
      </div>
      {sidebarCollapsed ? (
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              onMouseEnter={() => router.prefetch(item.href)}
              onFocus={() => router.prefetch(item.href)}
              className="flex h-9 w-9 items-center justify-center rounded-dash-md text-dash-muted-foreground hover:bg-dash-accent hover:text-dash-foreground"
            >
              <item.icon className="h-4 w-4" />
            </Link>
          ))}
        </nav>
      ) : (
        <SidebarNav />
      )}
      <button
        type="button"
        onClick={toggleSidebar}
        className="flex h-11 items-center justify-center gap-2 border-t border-dash-border text-xs text-dash-muted-foreground transition-colors hover:bg-dash-accent hover:text-dash-foreground"
      >
        {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : (
          <>
            <ChevronsLeft className="h-4 w-4" /> Collapse
          </>
        )}
      </button>
    </aside>
  );
}
