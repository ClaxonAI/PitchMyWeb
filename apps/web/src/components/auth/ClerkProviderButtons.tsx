"use client";

import { useEffect, useState } from "react";
import { useAuth, useSignIn, useSignUp } from "@clerk/nextjs";
import { exchangeClerkSession } from "@/lib/clerk-session";
import { afterSignIn } from "@/lib/safe-next";
import { clearSignInIntent, parkSignInIntent, readSignInIntent } from "@/lib/sign-in-intent";
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
  const { isSignedIn, isLoaded, getToken, signOut } = useAuth();
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read after mount (not useSearchParams) so the sign-in form stays in the
  // static HTML; see AuthForm.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "session") {
      setError("We couldn't start your session. Please try again.");
    }
  }, []);

  // An SSO round trip can land the visitor back here already signed in with
  // Clerk but without this app's session cookie — Clerk returns them to
  // /dashboard, which has no way to mint that cookie and sends them here.
  // Without this they are stuck being shown a sign-in form they have already
  // completed, and clicking a provider is the only way out. Running the
  // exchange on arrival turns that dead end into a redirect they never see.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || pending) return;
    let active = true;
    const intent = readSignInIntent();
    void exchangeClerkSession(getToken, intent.orderId).then(async (ok) => {
      if (!active) return;
      if (ok === true) {
        // replace: Back from the destination must not come back to this form.
        clearSignInIntent();
        window.location.replace(afterSignIn(intent.next));
        return;
      }
      if (ok !== false) {
        // A new account this device may not create (three already exist on
        // it). Drop the Clerk session so the visitor can sign in to one of
        // those instead of being retried into the same refusal.
        try {
          await signOut();
        } catch {
          // The message below still explains what to do.
        }
        if (active) setError(ok.message);
        return;
      }
      // Not exchangeable — most often a Clerk session signed by a rotated
      // key. Left in place it would retry on every visit and fail the same
      // way, so drop it and let them sign in cleanly.
      try {
        await signOut();
      } catch {
        // Nothing useful to do; the form below still works.
      }
      if (active) setError("Your previous session has expired. Please sign in again.");
    });
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, pending, getToken, signOut]);

  async function continueWith(provider: Provider): Promise<void> {
    setPending(provider);
    setError(null);
    try {
      // Clerk already has a session (e.g. the app cookie expired): starting a
      // new sign-in would be rejected with "already signed in", so just
      // re-create the app session and continue.
      const intent = readSignInIntent();
      if (isSignedIn) {
        const exchanged = await exchangeClerkSession(getToken, intent.orderId);
        if (exchanged === true) {
          clearSignInIntent();
          window.location.replace(afterSignIn(intent.next));
          return;
        }
        if (exchanged !== false) {
          await signOut();
          throw new Error(exchanged.message);
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
      // Left pointing at the destination page deliberately (the dashboard
      // unless the visitor was headed somewhere else). Clerk only routes through
      // redirectCallbackUrl when it needs more input, so landing on
      // /dashboard without the app's cookie is the ordinary case, not a
      // failure — the dashboard sends those visitors to /login, and the
      // effect above completes the exchange there and returns them.
      //
      // Do not "fix" this to /sso-callback: an absolute URL stops the flow
      // starting at all, and a relative one was no better in testing. The
      // recovery above is what makes the destination not matter.
      const redirectCallbackUrl = `${window.location.origin}/sso-callback`;
      // Clerk drops our query string on the way back, so where the visitor was
      // going and the order they are claiming ride along in sessionStorage.
      parkSignInIntent(intent);
      const redirectUrl = afterSignIn(intent.next);
      if (mode === "sign-in") {
        if (signInFetchStatus === "fetching") return;
        const result = await signIn.sso({ strategy, redirectUrl, redirectCallbackUrl });
        if (result.error) throw new Error(result.error.message);
      } else {
        if (signUpFetchStatus === "fetching") return;
        const result = await signUp.sso({ strategy, redirectUrl, redirectCallbackUrl });
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