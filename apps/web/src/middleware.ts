import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// This file has to live in src/, next to app/ — not at the package root.
// Next only looks for middleware beside the app directory, so while this sat
// at apps/web/middleware.ts it was never compiled: the built
// middleware-manifest.json listed no middleware at all, and nothing here ran
// in any environment. It went unnoticed while the file only called
// clerkMiddleware(), which nothing server-side depended on, and surfaced the
// moment the navbar started reading the hint cookie below and every visitor
// rendered as signed out. Moving it back would fail silently again.

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
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|png|jpg|jpeg|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
