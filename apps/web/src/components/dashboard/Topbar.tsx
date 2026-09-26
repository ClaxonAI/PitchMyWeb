"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Menu, Moon, Settings, Shield, Sun } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/dashboard-ui/avatar";
import { Button } from "@/components/dashboard-ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/dashboard-ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/dashboard-ui/sheet";
import { useBackToClose } from "@/lib/use-back-to-close";
import { SidebarNav } from "./Sidebar";
import { useSession } from "./SessionProvider";
import { Badge } from "@/components/dashboard-ui/badge";

function initialsOf(name: string | null, email: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return email[0]!.toUpperCase();
}

export function Topbar() {
  const session = useSession();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  // The phone's Back button closes the drawer instead of leaving the page.
  const dismissMenu = useBackToClose(mobileOpen, () => setMobileOpen(false));
  const [loggingOut, setLoggingOut] = useState(false);
  // next-themes only knows the real theme on the client (it reads
  // localStorage) — the server always renders as if no theme were chosen
  // yet, so rendering resolvedTheme-dependent markup before mount produces
  // a server/client mismatch. Render a neutral icon until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Back after logging out restores the dashboard from the back/forward
  // cache without asking the server. Reload it instead, so the session check
  // runs and a signed-out visitor is sent to /login rather than shown data.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  function handleLogout() {
    setLoggingOut(true);
    // A full navigation, not router.push: /logout ends the Clerk session as
    // well as the app one (see that page), and nothing from the dashboard's
    // client cache should outlive signing out.
    window.location.assign("/logout");
  }

  return (
    <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 border-b border-dash-border bg-dash-card px-4 pt-[env(safe-area-inset-top)] max-md:gap-1 max-md:pr-2">
      <Sheet open={mobileOpen} onOpenChange={(next) => (next ? setMobileOpen(true) : dismissMenu())}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetTitle className="display px-1 text-base">PitchMyWeb</SheetTitle>
          <div className="mt-4 flex-1">
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex-1" />

{/* Credits, not plan status: there is no unlimited state any more, so what
          matters at a glance is how many pitches this account can still send.
          Reserved credits are called out separately when there are any —
          they are neither spent nor spendable, and a balance that looks
          lower than expected is usually a batch still working. */}
      <Badge variant={session.availableCredits > 0 ? "success" : "destructive"} className="hidden sm:inline-flex">
        {session.availableCredits} {session.availableCredits === 1 ? "credit" : "credits"}
        {session.reservedCredits > 0 ? ` · ${session.reservedCredits} sending` : ""}
      </Badge>

      <Button variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Toggle dark mode">
        {mounted ? resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" /> : <span className="h-4 w-4" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center gap-2 rounded-dash-md px-1.5 py-1 transition-colors hover:bg-dash-accent max-md:h-11 max-md:min-w-11 max-md:justify-center">
            <Avatar className="h-7 w-7">
              <AvatarFallback>{initialsOf(session.name, session.email)}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[10rem] truncate text-sm font-medium text-dash-foreground sm:inline">{session.name ?? session.email}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>{session.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(session.role === "ADMIN" || session.role === "SUPER_ADMIN") && (
            <DropdownMenuItem onSelect={() => router.push("/admin")}>
              <Shield className="h-4 w-4" /> Admin
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => router.push("/settings")}>
            <Settings className="h-4 w-4" /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={loggingOut} onSelect={handleLogout}>
            <LogOut className="h-4 w-4" /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
