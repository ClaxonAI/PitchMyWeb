"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The pages that used to be their own sidebar modules, now tabs inside
// Campaigns: one place for everything a campaign produces.
const TABS = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/leads", label: "Leads" },
  { href: "/websites", label: "Websites" },
  { href: "/pitches", label: "Pitches" },
  { href: "/activity", label: "Activity" },
];

export function WorkTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Campaign sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-dash-border px-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active ? "border-dash-primary text-dash-primary" : "border-transparent text-dash-muted-foreground hover:text-dash-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
