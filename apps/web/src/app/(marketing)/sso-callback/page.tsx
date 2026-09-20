"use client";

import { AuthenticateWithRedirectCallback, useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { exchangeClerkSession } from "@/lib/clerk-session";

export default function SsoCallbackPage() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    void exchangeClerkSession(getToken).then((ok) => {
      if (!active) return;
      if (ok) {
        router.replace("/dashboard");
        router.refresh();
      } else {
        setError("Could not finish sign-in. Please try again.");
      }
    });
    return () => { active = false; };
  }, [getToken, isLoaded, isSignedIn, router]);

  return (
    <>
      <AuthenticateWithRedirectCallback />
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}