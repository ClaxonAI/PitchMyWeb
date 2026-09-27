"use client";

import { siteConfig } from "@/data/site";

// Last resort: an error in the root layout itself, where nothing else
// (fonts, styles, navbar) can be relied on. So it brings its own html/body
// and inline styles.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fbfaf7", color: "#15161b" }}>
        <main style={{ maxWidth: 480, margin: "0 auto", padding: "96px 20px", textAlign: "center" }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#5b5d66", lineHeight: 1.6 }}>
            Please try again. If it keeps happening, write to {siteConfig.email}{error.digest ? ` and mention code ${error.digest}` : ""}.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, height: 44, padding: "0 20px", borderRadius: 8, border: 0, background: "#15161b", color: "#fff", fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
