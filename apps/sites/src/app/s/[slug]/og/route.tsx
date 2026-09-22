import { ImageResponse } from "next/og";
import { getPreviewChrome } from "@pitchmyweb/templates";
import { fetchSite } from "@/lib/api";
import { previewCardColors } from "@/templates/surface";

// The link-preview image WhatsApp shows under the preview link (og:image).
// 1200×630, but everything that matters sits inside the centre square:
// WhatsApp crops link thumbnails to a square on phones. Plain text only —
// the bundled font has no symbol glyphs.

const SIZE = { width: 1200, height: 630 };
const MAX_NAME = 64;

function nameSize(name: string): number {
  if (name.length <= 14) return 92;
  if (name.length <= 24) return 76;
  if (name.length <= 40) return 60;
  return 48;
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const site = await fetchSite((await params).slug);
  if (!site) return new Response("Not found", { status: 404 });

  const { content } = site;
  const colors = previewCardColors(content);
  const chrome = getPreviewChrome(content.template);
  const name = content.businessName.length > MAX_NAME ? `${content.businessName.slice(0, MAX_NAME - 1).trimEnd()}…` : content.businessName;
  const detail = site.expired ? "This preview has ended" : [chrome.noun, content.area].filter(Boolean).join(" · ");
  const rating =
    !site.expired && content.rating !== undefined
      ? `Rated ${content.rating.toFixed(1)} on Google${content.reviewCount ? ` · ${content.reviewCount.toLocaleString("en-IN")} reviews` : ""}`
      : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 300px",
          background: colors.background,
          color: colors.color,
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 22, letterSpacing: 5, textTransform: "uppercase", color: colors.accent }}>
          <div style={{ width: 12, height: 12, marginRight: 14, borderRadius: 999, background: colors.accent }} />
          Website concept
        </div>
        <div style={{ display: "flex", marginTop: 34, fontSize: nameSize(name), lineHeight: 1.05, letterSpacing: -1.5 }}>{name}</div>
        {detail && <div style={{ display: "flex", marginTop: 30, fontSize: 30, opacity: 0.82 }}>{detail}</div>}
        {rating && <div style={{ display: "flex", marginTop: 18, fontSize: 24, color: colors.accent }}>{rating}</div>}
      </div>
    ),
    { ...SIZE, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
