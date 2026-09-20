"use client";

import { useState } from "react";
import { useAuth, useSignIn, useSignUp } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { exchangeClerkSession } from "@/lib/clerk-session";
import { Github } from "lucide-react";

type AuthMode = "sign-in" | "sign-up";
type Provider = "google" | "github";

const providers: Array<{ id: Provider; label: string }> = [
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
];

function GoogleIcon() {
  return <span aria-hidden className="font-semibold text-[#4285f4]">G</span>;
}

export function ClerkProviderButtons({ mode }: { mode: AuthMode }) {
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const { isSignedIn, getToken, signOut } = useAuth();
  const sessionFailed = useSearchParams().get("error") === "session";
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(sessionFailed ? "We couldn't start your session. Please try again." : null);

  async function continueWith(provider: Provider): Promise<void> {
    setPending(provider);
    setError(null);
    try {
      // Clerk already has a session (e.g. the app cookie expired): starting a
      // new sign-in would be rejected with "already signed in", so just
      // re-create the app session and continue.
      if (isSignedIn) {
        if (await exchangeClerkSession(getToken)) {
          window.location.assign("/dashboard");
          return;
        }
        // The Clerk session is no longer exchangeable — the usual cause is the
        // secret key being rotated while a browser still holds a session signed
        // by the old one. Without discarding it every retry re-enters this same
        // branch and fails identically, so the button loops forever and only
        // clearing cookies escapes. Dropping it means the next click runs a
        // fresh OAuth flow.
        await signOut();
        throw new Error("Your previous session has expired. Please sign in again.");
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
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          disabled={pending !== null}
          onClick={() => void continueWith(provider.id)}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-2xl border border-ink/12 bg-white text-[14px] font-medium text-ink transition hover:border-ink/25 hover:bg-mist-2 disabled:cursor-wait disabled:opacity-60"
        >
          {provider.id === "google" ? <GoogleIcon /> : <Github className="size-4" />}
          {pending === provider.id ? "Connecting..." : provider.label}
        </button>
      ))}
      {error ? <p role="alert" className="text-[13px] text-[#c2412f]">{error}</p> : null}
    </div>
  );
}