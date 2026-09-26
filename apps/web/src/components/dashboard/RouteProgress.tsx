"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// A slim bar across the top from the moment a link to another page is tapped
// until that page has rendered — instant feedback that the tap registered,
// even on a slow connection where the loading skeleton takes a beat. Only
// page changes count: a link that only changes the query (filters) keeps the
// page on screen and needs no bar.
export function RouteProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      clear();
      setState("loading");
      // Never stuck: a navigation that fails or is cancelled clears itself.
      timers.current.push(window.setTimeout(() => setState("idle"), 10_000));
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clear();
    };
  }, []);

  useEffect(() => {
    setState((current) => (current === "loading" ? "done" : current));
    const id = window.setTimeout(() => setState((current) => (current === "done" ? "idle" : current)), 250);
    return () => window.clearTimeout(id);
  }, [pathname]);

  if (state === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div
        className="h-full bg-dash-primary transition-[width,opacity] ease-out"
        style={{ width: state === "loading" ? "80%" : "100%", opacity: state === "done" ? 0 : 1, transitionDuration: state === "loading" ? "8s" : "200ms" }}
      />
    </div>
  );
}
