import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(appDir, "../..");

// Overridable so a deploy can build into a staging directory and swap it in
// rather than over the live one; infrastructure/aws/bootstrap.sh explains why.
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // @pitchmyweb/db and @pitchmyweb/contracts ship TypeScript source rather
  // than a compiled dist (see packages/db/src/index.ts for why), so Next has
  // to compile them itself. Turbopack already transpiles workspace packages
  // automatically, but `next build` and any webpack path do not — listing
  // them makes both pipelines behave the same.
  transpilePackages: ["@pitchmyweb/db", "@pitchmyweb/contracts", "@pitchmyweb/templates", "@pitchmyweb/storage"],

  // BullMQ and ioredis open sockets and load native/optional deps at
  // runtime; leaving them external means Node `require`s the real package
  // instead of a bundled copy, which is what both libraries expect.
  serverExternalPackages: ["bullmq", "ioredis"],

  poweredByHeader: false,

  // Every response here is JSON, an event stream or a redirect — never a page
  // to be sniffed as HTML or framed.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },

  turbopack: {
    // Without this Turbopack infers the workspace root from the nearest
    // lockfile and, in a monorepo with sibling apps, can pick the wrong one.
    // Pinning it to the repo root keeps packages/* inside the compiled scope.
    root: monorepoRoot,
  },
};

export default nextConfig;
