import { NextResponse, type NextRequest } from "next/server";

// Cross-site request forgery guard for every state-changing API call.
//
// Sessions ride on a cookie, and browsers attach it to requests any website
// makes, including a hidden form POST from an attacker's page. Such a form
// could sign a visitor into the attacker's account (so a purchase they then
// make credits the attacker) or sign them out. Browsers always send an Origin
// header on cross-site POSTs, so a write whose Origin is not this app is
// refused. No Origin at all means a non-browser caller (the workers, the
// web app's server, a payment webhook), which cookies do not reach anyway.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The web app (whose /api/* is proxied here) and this API itself. */
export function allowedOrigins(request: NextRequest, env: NodeJS.ProcessEnv = process.env): Set<string> {
  const origins = new Set<string>([request.nextUrl.origin]);
  for (const value of [env.APP_URL, env.API_PUBLIC_URL]) {
    const origin = originOf(value?.trim());
    if (origin) origins.add(origin);
  }
  return origins;
}

export function proxy(request: NextRequest): NextResponse {
  if (SAFE_METHODS.has(request.method)) return NextResponse.next();
  const origin = request.headers.get("origin");
  if (origin === null) return NextResponse.next();
  if (allowedOrigins(request).has(origin)) return NextResponse.next();
  return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
}

export const config = { matcher: "/api/:path*" };
