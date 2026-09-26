"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavItemActive, NAV_ITEMS } from "./nav-items";

// Phones only: the four modules one tap away at the bottom of the screen,
// where a thumb reaches, instead of two taps through the ☰ drawer. Clears the
// iPhone home indicator, and reserves its own height at the end of the page
// so it never covers the last row of content.
export function MobileTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname?.startsWith("/admin")) return null;
  return (
    <>
      <div aria-hidden className="h-[calc(3.5rem+1px+env(safe-area-inset-bottom))] shrink-0 md:hidden" />
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-dash-border bg-dash-card pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid grid-cols-4">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onTouchStart={() => router.prefetch(item.href)}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                    active ? "text-dash-primary" : "text-dash-muted-foreground active:text-dash-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
