import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

// Sign-in and sign-up carry no content worth ranking, and an indexed /login
// competing with the landing page on brand queries is a net loss.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Clerk is only needed where people actually sign in: social sign-in on
// /login and /register, and the OAuth return on /sso-callback. Mounting it
// here instead of in the root layout keeps its ~1 MB of browser JavaScript
// off every other page. The dashboard never used it — it runs on the app's
// own pmw_session cookie — and the navbar learns sign-in state from the
// pmw_signed_in hint set in middleware.ts.
//
// No publishableKey prop: the SDK reads NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
// itself, and clerkMiddleware() reads that same variable and nothing else.
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
