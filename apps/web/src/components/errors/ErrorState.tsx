"use client";

import { useEffect } from "react";
import Link from "next/link";
import { siteConfig } from "@/data/site";

// What a visitor sees when a page throws: a plain explanation, a retry that
// re-renders the segment (Next's reset), a way home, and a human to write to.
// Replaces Next's bare "Application error" screen. `digest` is the id the
// server logged the error under; showing it lets support find the entry.
export function ErrorState({
  error,
  reset,
  tone = "marketing",
  homeHref = "/",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  tone?: "marketing" | "dashboard";
  homeHref?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const dash = tone === "dashboard";
  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center px-5 py-20 text-center">
      <p className={dash ? "text-sm font-medium text-dash-destructive" : "eyebrow text-primary"}>Something went wrong</p>
      <h1 className={dash ? "mt-3 text-2xl font-semibold text-dash-foreground" : "display mt-4 text-4xl sm:text-5xl"}>This page hit a snag.</h1>
      <p className={dash ? "mt-3 text-sm text-dash-muted-foreground" : "mt-4 text-ink/60"}>
        It&apos;s on our side, not yours. Try again — if it keeps happening, write to{" "}
        <a href={`mailto:${siteConfig.email}`} className="underline underline-offset-2">
          {siteConfig.email}
        </a>
        {error.digest ? ` and mention code ${error.digest}` : ""}.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className={dash ? "inline-flex h-11 items-center rounded-dash-md bg-dash-primary px-5 text-sm font-medium text-dash-primary-foreground" : "inline-flex h-11 items-center rounded-lg bg-ink px-5 text-sm font-medium text-white"}
        >
          Try again
        </button>
        <Link
          href={homeHref}
          className={dash ? "inline-flex h-11 items-center rounded-dash-md border border-dash-border px-5 text-sm font-medium text-dash-foreground" : "inline-flex h-11 items-center rounded-lg border border-ink/12 px-5 text-sm font-medium text-ink"}
        >
          {homeHref === "/" ? "Back to home" : "Back to dashboard"}
        </Link>
      </div>
    </div>
  );
}
