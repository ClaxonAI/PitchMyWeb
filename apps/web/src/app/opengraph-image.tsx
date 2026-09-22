import { ImageResponse } from "next/og";

// The link preview card for every marketing page — WhatsApp, LinkedIn, X,
// Slack. Living at the app root means Next applies it as the default
// og:image and twitter:image for the whole site, so a page only has to
// declare its own if it wants a different one.
//
// Generated rather than a checked-in PNG so the wordmark and the palette stay
// in step with globals.css. Plain text and flat colour only: next/og's
// renderer supports a subset of CSS, and the default font has no symbol
// glyphs.

export const alt = "PitchMyWeb — show them the website before they ask for one";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Mirrors --color-mist-2 / --color-ink / --color-primary in globals.css.
const PAPER = "#fbf8f2";
const INK = "#0a0a0a";
const PRIMARY = "#3157d5";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: "72px 80px",
          // next/og has no default font stack of its own to fall back through.
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 20, height: 20, borderRadius: 999, background: PRIMARY }} />
          <div style={{ fontSize: 34, fontWeight: 700, color: INK, letterSpacing: -0.5 }}>PitchMyWeb</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 76, fontWeight: 700, color: INK, lineHeight: 1.08, letterSpacing: -2, maxWidth: 940 }}>
            Show them the website before they ask for one.
          </div>
          <div style={{ fontSize: 30, color: "#4a4a52", lineHeight: 1.4, maxWidth: 860 }}>
            Local businesses with no website, a real sample site built for each, pitched from your own WhatsApp.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 26, color: PRIMARY, fontWeight: 600 }}>
          <div style={{ width: 64, height: 4, background: PRIMARY }} />
          <div>pitchmyweb.in</div>
        </div>
      </div>
    ),
    size,
  );
}
