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

// Signed-in visitors who open /login or /register are sent to the dashboard
// instead of being shown a form for an account they are already in. Not when
// the page carries an orderId (a post-payment sign-in that must claim the
// order) or the expired flag below.
const AUTH_FORMS = new Set(["/login", "/register"]);

// requireSession() sends a visitor here with ?expired=1 when their session
// cookie was present but the API refused it (expired, revoked, or from
// another database). The cookie itself is HttpOnly and only a response can
// clear it: without this, the stale cookie kept the hint alive, so the home
// page offered "Go to dashboard" forever and every click bounced to /login.
const EXPIRED_PARAM = "expired";

function clearSession(response: NextResponse): NextResponse {
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(SIGNED_IN_HINT);
  return response;
}

export default clerkMiddleware((_auth, request) => {
  const { pathname, searchParams } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE);
  const hinted = request.cookies.get(SIGNED_IN_HINT)?.value === "1";

  if (AUTH_FORMS.has(pathname)) {
    if (searchParams.get(EXPIRED_PARAM) === "1") {
      return signedIn || hinted ? clearSession(NextResponse.next()) : undefined;
    }
    if (signedIn && !searchParams.has("orderId")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

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
    // The extension list is what keeps static files out of this middleware.
    // Anything missing from it gets the hint cookie's Set-Cookie attached,
    // which stops any shared cache or CDN from serving that file — for a
    // cookie the request will never send back. webp covers public/images
    // (every logo there is one); txt|xml cover /robots.txt and /sitemap.xml.
    //
    // /api is left out as well. Every /api request is only forwarded to the
    // API app (next.config.ts rewrites), which checks its own session; this
    // web app has no API routes of its own. Running Clerk and the cookie sync
    // on each of those calls (including every poll a running campaign makes)
    // only added time to them.
    "/((?!_next|api/|[^?]*\\.(?:html?|css|js(?!on)|png|jpg|jpeg|gif|svg|webp|ttf|woff2?|ico|csv|docx?|xlsx?|zip|txt|xml|webmanifest)).*)",
    "/__clerk/:path*",
  ],
};
