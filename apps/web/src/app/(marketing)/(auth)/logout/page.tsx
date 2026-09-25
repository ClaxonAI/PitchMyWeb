"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { authApi } from "@/lib/api-client";

// Signing out has two halves, and both have to end here:
//
//   1. The app session (pmw_session), which the dashboard checks.
//   2. The Clerk session a Google/GitHub sign-in leaves in the browser.
//
// Ending only the first used to be the whole of "Log out", and for a social
// sign-in it did nothing visible: /login found the still-live Clerk session,
// exchanged it for a fresh app session and sent the user straight back to the
// dashboard. This page sits in the (auth) group because that is where
// ClerkProvider is mounted, so it can end both, then lands on the home page
// with a full navigation so no cached dashboard page survives.
// How long to wait for Clerk before leaving anyway. If Clerk's script cannot
// load at all, /login cannot load it either, so there is no live session
// there to bounce the user back.
const CLERK_WAIT_MS = 6000;

export default function LogoutPage() {
  const { signOut, loaded } = useClerk();
  const [appSignedOut, setAppSignedOut] = useState(false);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    window.location.replace("/");
  }, []);

  // The app session first, straight away: it does not depend on Clerk.
  useEffect(() => {
    const fallback = window.setTimeout(finish, CLERK_WAIT_MS);
    authApi
      .logout()
      .catch(() => undefined) // Already gone is fine.
      .finally(() => setAppSignedOut(true));
    return () => window.clearTimeout(fallback);
  }, [finish]);

  // Then Clerk's, once its script is ready.
  useEffect(() => {
    if (!appSignedOut || !loaded) return;
    signOut()
      .catch(() => undefined) // No Clerk session (email/password sign-in).
      .finally(finish);
  }, [appSignedOut, loaded, signOut, finish]);

  return <p className="py-24 text-center text-sm text-ink/60">Signing you out…</p>;
}
