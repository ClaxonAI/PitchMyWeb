"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The tabs at the top of a sidebar module: the pages that used to be their
// own sidebar entries now live inside Campaigns or Settings.
const SECTIONS = {
  campaigns: [
    { href: "/campaigns", label: "Campaigns" },
    { href: "/campaigns/new", label: "New campaign" },
    { href: "/leads", label: "Leads" },
    { href: "/pitches", label: "Pitches" },
    { href: "/activity", label: "Activity" },
  ],
  settings: [
    { href: "/settings", label: "General" },
    { href: "/whatsapp", label: "WhatsApp" },
    { href: "/billing", label: "Billing" },
  ],
} as const;

export function SectionTabs({ section }: { section: keyof typeof SECTIONS }) {
  const pathname = usePathname();
  return (
    <nav aria-label={`${section === "campaigns" ? "Campaign" : "Settings"} sections`} className="-mx-1 flex gap-1 overflow-x-auto border-b border-dash-border px-1">
      {SECTIONS[section].map((tab) => {
        // The most specific tab wins: /campaigns/new lights "New campaign",
        // not "Campaigns"; /leads/[id] still lights "Leads".
        const matches = (href: string) => pathname === href || pathname?.startsWith(`${href}/`) === true;
        const active = matches(tab.href) && !SECTIONS[section].some((other) => other.href.length > tab.href.length && matches(other.href));
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
