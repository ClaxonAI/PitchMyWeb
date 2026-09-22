import { ImageResponse } from "next/og";

// A real preview image matters more here than on most marketing sites: the
// product's own pitch arrives as a WhatsApp link, and a link with no image
// renders as a grey box next to one that renders as a card. Generated rather
// than committed as a PNG so the wording cannot drift from the page copy.
//
// Deliberately typeset in the runtime's default face, not Fraunces. next/font
// hands out .woff2, which Satori cannot parse, so matching the brand face here
// would mean committing a separate .ttf purely for this file.
export const alt = "PitchMyWeb — Show them the website before they ask for one";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
          background: "#0a0a0a",
          padding: "80px",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "20px", height: "20px", background: "#3157d5" }} />
          <div style={{ fontSize: 26, letterSpacing: "0.18em", color: "rgba(255,255,255,0.6)" }}>
            FIND · BUILD · RECORD · SEND
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 78, lineHeight: 1.05, letterSpacing: "-0.02em", display: "flex", flexWrap: "wrap" }}>
            Show them the website
          </div>
          <div style={{ fontSize: 78, lineHeight: 1.05, letterSpacing: "-0.02em", display: "flex", gap: "20px" }}>
            <span style={{ color: "#9aaeff" }}>before</span>
            <span>they ask for one.</span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 30, color: "rgba(255,255,255,0.65)", maxWidth: "760px" }}>
            Sample sites for local businesses, pitched from your own WhatsApp.
          </div>
          <div style={{ fontSize: 32, fontWeight: 600 }}>PitchMyWeb</div>
        </div>
      </div>
    ),
    size,
  );
}
