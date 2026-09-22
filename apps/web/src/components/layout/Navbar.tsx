"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { navLinks } from "@/data/site";
import { cn } from "@/lib/utils";

// Set by middleware.ts whenever the app session cookie (HttpOnly) exists.
// Read after mount: the marketing pages are static, so the server-rendered
// navbar is always the signed-out one.
function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    setSignedIn(/(?:^|;\s*)pmw_signed_in=1(?:;|$)/.test(document.cookie));
  }, []);
  return signedIn;
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const signedIn = useSignedIn();

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
          // Blur only from md up: on phones it re-renders every scroll frame
          // (jank on budget GPUs) behind a header that is nearly opaque anyway.
          ? "border-ink/10 bg-white/95 shadow-[0_1px_0_0_rgb(10_10_10/0.06)] md:bg-white/90 md:backdrop-blur-xl"
          : "border-white/0 bg-white/90 md:bg-white/60 md:backdrop-blur-md",
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
                  "relative inline-flex min-h-11 items-center px-3 text-sm transition-colors duration-200 hover:text-ink",
                  active ? "text-ink font-medium" : "text-ink/60",
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
          {signedIn ? (
            <Button href="/dashboard" variant="primary" size="sm">Go to dashboard</Button>
          ) : (
            <>
              <Button href="/login" variant="ghost" size="sm" className="text-ink/70">Sign in</Button>
              <Button href="/register" variant="primary" size="sm">Start pitching</Button>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 grid size-11 place-items-center rounded-lg transition-colors hover:bg-mist md:hidden"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </Container>

      {open && (
        <div className="animate-rise border-t border-ink/8 bg-white md:hidden">
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
            {signedIn ? (
              <Button href="/dashboard" variant="primary" className="mt-3 w-full">Go to dashboard</Button>
            ) : (
              <>
                <Button href="/login" variant="ghost" className="mt-3 w-full">Sign in</Button>
                <Button href="/register" variant="primary" className="mt-2 w-full">Start pitching</Button>
              </>
            )}
          </Container>
        </div>
      )}
    </header>
  );
}
