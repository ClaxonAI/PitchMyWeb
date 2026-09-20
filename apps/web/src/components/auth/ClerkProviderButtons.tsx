"use client";

import { useEffect, useState } from "react";
import { useAuth, useSignIn, useSignUp } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { exchangeClerkSession } from "@/lib/clerk-session";
import { Github } from "lucide-react";

type AuthMode = "sign-in" | "sign-up";
type Provider = "apple" | "google" | "github";

const providers: Array<{ id: Provider; label: string }> = [
  { id: "apple", label: "Continue with Apple" },
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
];

function isAppleDevice(): boolean {
  const userAgent = navigator.userAgent;
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function AppleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-current">
      <path d="M17.05 12.54c-.02-2.35 1.92-3.48 2.01-3.53a4.33 4.33 0 0 0-3.4-1.84c-1.43-.15-2.82.85-3.54.85-.74 0-1.86-.83-3.05-.81a4.5 4.5 0 0 0-3.79 2.31c-1.64 2.84-.42 7.02 1.15 9.32.79 1.12 1.71 2.37 2.9 2.33 1.16-.05 1.6-.75 3.02-.75 1.41 0 1.82.75 3.03.72 1.25-.02 2.04-1.12 2.8-2.25a9.2 9.2 0 0 0 1.28-2.61 4.04 4.04 0 0 1-2.41-3.74Z" />
      <path d="M14.72 5.63a4.13 4.13 0 0 0 .95-2.98 4.2 4.2 0 0 0-2.73 1.41 3.9 3.9 0 0 0-.98 2.87 3.48 3.48 0 0 0 2.76-1.3Z" />
    </svg>
  );
}

function GoogleIcon() {
  return <span aria-hidden className="font-semibold text-[#4285f4]">G</span>;
}

export function ClerkProviderButtons({ mode }: { mode: AuthMode }) {
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const { isSignedIn, getToken } = useAuth();
  const sessionFailed = useSearchParams().get("error") === "session";
  const [appleDevice, setAppleDevice] = useState<boolean | null>(null);
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(sessionFailed ? "We couldn't start your session. Please try again." : null);

  useEffect(() => setAppleDevice(isAppleDevice()), []);

  const visibleProviders = providers;

  async function continueWith(provider: Provider): Promise<void> {
    setPending(provider);
    setError(null);
    try {
      // Clerk already has a session (e.g. the app cookie expired): starting a
      // new sign-in would be rejected with "already signed in", so just
      // re-create the app session and continue.
      if (isSignedIn) {
        if (!(await exchangeClerkSession(getToken))) throw new Error("We couldn't start your session. Please try again.");
        window.location.assign("/dashboard");
        return;
      }
      const strategy = `oauth_${provider}` as const;
      const redirectUrl = `${window.location.origin}/sso-callback`;
      if (mode === "sign-in") {
        if (signInFetchStatus === "fetching") return;
        const result = await signIn.sso({ strategy, redirectUrl: "/dashboard", redirectCallbackUrl: redirectUrl });
        if (result.error) throw new Error(result.error.message);
      } else {
        if (signUpFetchStatus === "fetching") return;
        const result = await signUp.sso({ strategy, redirectUrl: "/dashboard", redirectCallbackUrl: redirectUrl });
        if (result.error) throw new Error(result.error.message);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start sign-in");
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {appleDevice === null ? <div className="h-11 w-full rounded-2xl border border-ink/8 bg-mist-2" aria-hidden /> : visibleProviders.map((provider) => (
        <button
          key={provider.id}
          type="button"
          disabled={pending !== null}
          onClick={() => void continueWith(provider.id)}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-2xl border border-ink/12 bg-white text-[14px] font-medium text-ink transition hover:border-ink/25 hover:bg-mist-2 disabled:cursor-wait disabled:opacity-60"
        >
          {provider.id === "apple" ? <AppleIcon /> : provider.id === "google" ? <GoogleIcon /> : <Github className="size-4" />}
          {pending === provider.id ? "Connecting..." : provider.label}
        </button>
      ))}
      {error ? <p role="alert" className="text-[13px] text-[#c2412f]">{error}</p> : null}
    </div>
  );
}