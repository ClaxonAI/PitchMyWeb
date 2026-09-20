import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appDir = path.dirname(fileURLToPath(import.meta.url));

// Who may embed the demo templates. The dashboard's origin is whatever APP_URL
// says, so it is read rather than hardcoded — a fixed domain here silently
// blocks every preview the moment the app is served from anywhere else, which
// is exactly what a hardcoded *.pitchmyweb.com did once the deployment went
// to pitchmyweb.in. The localhost entries keep `npm run dev` working.
const appOrigin = process.env.APP_URL?.trim().replace(/\/$/, "");
const frameAncestors = ["'self'", "http://localhost:3000", "http://127.0.0.1:3000", appOrigin]
  .filter(Boolean)
  .join(" ");

// Public preview sites. Every response is marked noindex: a preview is a
// sales concept for a real business, not that business's official website,
// and must never show up in search results.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@pitchmyweb/templates"],
  outputFileTracingRoot: path.resolve(appDir, "../.."),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Allow the marketing site to embed demo templates in Sample Sites.
        source: "/demo/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
