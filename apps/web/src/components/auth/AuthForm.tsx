"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { ApiError, authApi } from "@/lib/api-client";
import { ClerkProviderButtons } from "./ClerkProviderButtons";
import { deviceFingerprint } from "@/lib/device-fingerprint";

// Shared by /login and /register. Email/password plus Google OAuth (proxied
// through /api/auth/google → apps/api).

type Mode = "login" | "register";

const copy: Record<Mode, { title: string; subtitle: string; action: string; altText: string; altLabel: string; altHref: string }> = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in to manage your campaigns and your linked WhatsApp number.",
    action: "Sign in",
    altText: "New here?",
    altLabel: "Create an account",
    altHref: "/register",
  },
  register: {
    title: "Create your account",
    subtitle: "One account links one WhatsApp number and every pitch you send from it.",
    action: "Create account",
    altText: "Already have an account?",
    altLabel: "Sign in",
    altHref: "/login",
  },
};

const googleErrors: Record<string, string> = {
  google: "Google sign-in failed. Please try again.",
  google_denied: "Google sign-in was cancelled.",
  suspended: "This account has been suspended.",
  device_limit: "This device already has 3 accounts. Sign in to one of them instead.",
};

export function AuthForm({ mode }: { mode: Mode }) {
  // orderId is set when this page was reached via a post-payment redirect
  // from /pricing (CheckoutDialog.tsx) — carried through to register/login so
  // apps/api can attach the paid order to the account being created/used
  // (see lib/checkout/checkout.service.ts's claimOrder). Absent for the
  // ordinary sign-up/sign-in flow with no prior purchase.
  //
  // Both query values are read after mount rather than with useSearchParams:
  // that hook opts the whole form out of static rendering, so the page used
  // to ship with no form at all and a phone saw an empty page until the
  // JavaScript arrived. Neither value is needed for the first paint.
  const [orderId, setOrderId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrderId(params.get("orderId"));
    const oauthError = params.get("error");
    // "session" belongs to the social buttons, which show their own message.
    if (oauthError && oauthError !== "session") setError(googleErrors[oauthError] ?? "Sign-in failed. Please try again.");
  }, []);
  const [pending, setPending] = useState(false);
  const [fingerprintId, setFingerprintId] = useState<string>();
  const text = copy[mode];

  useEffect(() => {
    let active = true;
    // Loaded on demand: the form works without it, so it stays out of the
    // sign-in page bundle.
    void deviceFingerprint().then((visitorId) => {
      if (active && visitorId) setFingerprintId(visitorId);
    });
    return () => { active = false; };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "login") {
        await authApi.login(email, password, orderId, fingerprintId);
      } else {
        await authApi.register(email, password, orderId, fingerprintId);
      }
      // A full navigation: the dashboard reads the session on the server, and
      // this guarantees it sees the cookie the API just set (no cached RSC
      // payload from before sign-in).
      window.location.assign("/dashboard");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.code === "ACCOUNT_SUSPENDED"
            ? "This account has been suspended."
            : caught.status === 401
              ? "That email and password do not match."
              : caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-[420px] border-t-2 border-primary pt-7">
        <h1 className="display text-[34px] leading-tight sm:text-[40px]">{text.title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink/60">{text.subtitle}</p>

        <div className="mt-8">
          <ClerkProviderButtons mode={mode === "login" ? "sign-in" : "sign-up"} />
        </div>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-ink/10" />
          <span className="font-mono text-[11px] tracking-[0.18em] text-ink/60 uppercase">or</span>
          <span className="h-px flex-1 bg-ink/10" />
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink/70">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 rounded-2xl border border-ink/12 bg-white px-4 text-sm outline-none transition focus:border-primary/50"
              placeholder="you@example.com"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink/70">Password</span>
            <input
              type="password"
              required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 rounded-2xl border border-ink/12 bg-white px-4 text-sm outline-none transition focus:border-primary/50"
              placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
            />
          </label>

          {error && (
            <p role="alert" className="rounded-2xl border border-coral/30 bg-coral/8 px-4 py-3 text-[13px] text-[#c2412f]">
              {error}
            </p>
          )}

          <Button type="submit" disabled={pending} className="mt-1 w-full">
            {pending ? "Just a moment…" : text.action}
          </Button>
        </form>

        <p className="mt-6 text-[13px] text-ink/60">
          {text.altText}{" "}
          <Link
            href={orderId ? `${text.altHref}?orderId=${encodeURIComponent(orderId)}` : text.altHref}
            className="text-primary underline underline-offset-2"
          >
            {text.altLabel}
          </Link>
        </p>
      </div>
    </Container>
  );
}
