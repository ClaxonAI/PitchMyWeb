"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton, useAuth } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { navLinks } from "@/data/site";
import { cn } from "@/lib/utils";
import { exchangeClerkSession } from "@/lib/clerk-session";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const { getToken } = useAuth();

  const goToDashboard = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    // Only enter the dashboard once the app session exists; otherwise it just
    // redirects back to /login and the user loops.
    if (await exchangeClerkSession(getToken)) window.location.assign("/dashboard");
    else window.location.assign("/login?error=session");
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-all duration-300",
        scrolled || open
          ? "border-ink/10 bg-white/90 shadow-[0_1px_0_0_rgb(10_10_10/0.06)] backdrop-blur-xl"
          : "border-white/0 bg-white/60 backdrop-blur-md",
      )}
    >
      <Container className="flex h-16 items-center justify-between gap-6">
        <Logo />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative px-3 py-2 text-sm transition-colors duration-200 hover:text-ink",
                  active ? "text-ink font-medium" : "text-ink/50",
                )}
              >
                {link.label}
                {active && (
                  <span className="absolute bottom-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Show when="signed-out">
            <Button href="/login" variant="ghost" size="sm" className="text-ink/60">Sign in</Button>
            <Button href="/register" variant="primary" size="sm">Start pitching</Button>
          </Show>
          <Show when="signed-in">
            <Button href="/dashboard" onClick={goToDashboard} variant="primary" size="sm">Go To Dashboard</Button>
            <UserButton />
          </Show>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 grid size-10 place-items-center rounded-lg transition-colors hover:bg-mist md:hidden"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </Container>

      {open && (
        <div className="animate-rise border-t border-ink/8 bg-white/95 backdrop-blur-xl md:hidden">
          <Container className="flex flex-col py-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "border-b border-ink/6 py-3.5 text-[15px] last:border-0 transition-colors",
                  pathname === link.href ? "text-ink font-medium" : "text-ink/70",
                )}
              >
                {link.label}
              </Link>
            ))}
            <Show when="signed-out">
              <Button href="/login" variant="ghost" className="mt-3 w-full">Sign in</Button>
              <Button href="/register" variant="primary" className="mt-2 w-full">Start pitching</Button>
            </Show>
            <Show when="signed-in">
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-ink/8 px-4 py-3">
                <Button href="/dashboard" onClick={goToDashboard} variant="primary" className="w-full">Go To Dashboard</Button>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-medium">Your account</span>
                  <UserButton />
                </div>
              </div>
            </Show>
          </Container>
        </div>
      )}
    </header>
  );
}
