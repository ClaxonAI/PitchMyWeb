import type { NextConfig } from "next";

// The API runs as a separate Next app on its own port. Proxying /api through
// this origin keeps the session cookie same-origin, which matters for two
// reasons: the cookie is HttpOnly + SameSite=Lax (so it would not be sent on
// a cross-origin XHR at all), and EventSource cannot set custom headers, so
// the SSE stream has no way to authenticate other than by cookie.
//
// The alternative — CORS plus credentials plus SameSite=None — would mean
// relaxing the cookie for every request in order to support one endpoint.
const API_URL = process.env.API_URL ?? "http://localhost:4000";
// Clerk loads clerk-js from its Frontend API host and calls that host for the
// OAuth callback / session. With a 'self'-only CSP those requests are blocked,
// so SSO never completes and /sso-callback can't mint the app session cookie.
// Set CLERK_FRONTEND_API_URL (e.g. https://clerk.example.com) for a production
// custom domain; the wildcard covers Clerk's development instances.
const clerkHosts = ["https://*.clerk.accounts.dev", "https://*.clerk.com", process.env.CLERK_FRONTEND_API_URL?.trim()].filter(Boolean).join(" ");
const scriptSources = `${process.env.NODE_ENV === "development" ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'"} ${clerkHosts} https://challenges.cloudflare.com`;

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: `default-src 'self'; script-src ${scriptSources} https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://img.clerk.com; font-src 'self' data:; connect-src 'self' https://checkout.razorpay.com https://api.razorpay.com ${clerkHosts} https://clerk-telemetry.com https://challenges.cloudflare.com; frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com https://challenges.cloudflare.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'` },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  async redirects() {
    // Phase 1 dashboard rebuild: the one page that existed before the
    // rebuild moved from /dashboard/whatsapp to /whatsapp (see
    // (dashboard)/layout.tsx's URL-scheme comment) — keep the old,
    // possibly-bookmarked URL working.
    return [{ source: "/dashboard/whatsapp", destination: "/whatsapp", permanent: false }];
  },
};

export default nextConfig;
