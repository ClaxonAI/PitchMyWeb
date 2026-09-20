"use client";

import { AuthenticateWithRedirectCallback, useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { exchangeClerkSession } from "@/lib/clerk-session";

export default function SsoCallbackPage() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn, signOut } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    void exchangeClerkSession(getToken).then(async (ok) => {
      if (!active) return;
      if (ok) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      // A Clerk session that cannot be exchanged fails the same way on every
      // attempt — after a secret-key rotation, most often. Left in place it
      // strands the visitor here, on a bare callback URL with an error and no
      // navigation, and going to /login by hand would loop on the same
      // session. Discarding it sends them somewhere that can actually retry.
      try {
        await signOut();
      } catch {
        // Even if this fails, /login is still a better place to be than here.
      }
      if (active) router.replace("/login?error=session");
    });
    return () => { active = false; };
  }, [getToken, isLoaded, isSignedIn, router, signOut]);

  return (
    <AuthenticateWithRedirectCallback />
  );
}