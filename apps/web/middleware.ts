import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// pmw_session, the app's own session cookie, is HttpOnly, so the statically
// rendered marketing pages cannot see it. Mirror only its presence into a
// readable hint cookie so the navbar can offer "Dashboard" to anyone who is
// signed in — email/password and social alike — without shipping Clerk to
// those pages or calling the API on every visit. The hint carries no secret:
// a stale one only shows the button, and the dashboard still checks the real
// session and sends an expired one to /login.
const SESSION_COOKIE = "pmw_session";
const SIGNED_IN_HINT = "pmw_signed_in";

export default clerkMiddleware((_auth, request) => {
  const signedIn = request.cookies.has(SESSION_COOKIE);
  const hinted = request.cookies.get(SIGNED_IN_HINT)?.value === "1";
  if (signedIn === hinted) return;

  const response = NextResponse.next();
  if (signedIn) {
    response.cookies.set(SIGNED_IN_HINT, "1", {
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    response.cookies.delete(SIGNED_IN_HINT);
  }
  return response;
});

export const config = {
  matcher: [
    // txt|xml keep /robots.txt and /sitemap.xml out of this middleware.
    // Both are static files, and the hint cookie above would attach a
    // Set-Cookie to them — which stops any shared cache or CDN from
    // serving them, for a cookie no crawler will ever send back.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|png|jpg|jpeg|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|txt|xml|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
