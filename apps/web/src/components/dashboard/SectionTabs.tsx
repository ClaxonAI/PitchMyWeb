"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The tabs at the top of a sidebar module: the pages that used to be their
// own sidebar entries now live inside Campaigns or Settings.
const SECTIONS = {
  campaigns: [
    { href: "/campaigns", label: "Campaigns" },
    { href: "/discover", label: "New campaign" },
    { href: "/leads", label: "Leads" },
    { href: "/pitches", label: "Pitches" },
    { href: "/activity", label: "Activity" },
  ],
  settings: [
    { href: "/settings", label: "General" },
    { href: "/profile", label: "Profile" },
    { href: "/whatsapp", label: "WhatsApp" },
  ],
} as const;

export function SectionTabs({ section }: { section: keyof typeof SECTIONS }) {
  const pathname = usePathname();
  return (
    <nav aria-label={`${section === "campaigns" ? "Campaign" : "Settings"} sections`} className="-mx-1 flex gap-1 overflow-x-auto border-b border-dash-border px-1">
      {SECTIONS[section].map((tab) => {
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
