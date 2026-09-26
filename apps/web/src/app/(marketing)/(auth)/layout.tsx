import { ClerkProvider } from "@clerk/nextjs";
import { CLERK_RETURN } from "@/lib/sign-in-intent";

// Clerk is only needed where people actually sign in: social sign-in on
// /login and /register, and the OAuth return on /sso-callback. Mounting it
// here instead of in the root layout keeps its ~1 MB of browser JavaScript
// off every other page. The dashboard never used it — it runs on the app's
// own pmw_session cookie — and the navbar learns sign-in state from the
// pmw_signed_in hint set in middleware.ts.
//
// No publishableKey prop: the SDK reads NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
// itself, and clerkMiddleware() reads that same variable and nothing else.
//
// Every way back from Google or GitHub lands on /login, which turns the Clerk
// session into the app's own and moves on (ClerkProviderButtons). Clerk's own
// defaults send some returns to "/" instead — notably a sign-in that Clerk
// turns into a sign-up for a new account — and the landing page cannot finish
// a sign-in, so those visitors sat there looking signed out.
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      signInForceRedirectUrl={CLERK_RETURN}
      signUpForceRedirectUrl={CLERK_RETURN}
      signInFallbackRedirectUrl={CLERK_RETURN}
      signUpFallbackRedirectUrl={CLERK_RETURN}
    >
      {children}
    </ClerkProvider>
  );
}
