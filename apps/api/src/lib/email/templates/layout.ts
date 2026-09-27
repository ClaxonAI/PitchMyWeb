// The frame every PitchMyWeb email shares: wordmark, one heading, the body,
// an optional button, and a footer. Table layout and inline styles, because
// that is what mail clients render reliably; a text wordmark rather than a
// logo image, so nothing depends on images being allowed to load.
//
// Transactional mail only: no unsubscribe link, no tracking pixel.

const BRAND = "#3157d5"; // apps/web --color-primary
const INK = "#1a1f36";
const MUTED = "#5b6178";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Every value interpolated into email HTML goes through this. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);
}

export type LayoutInput = {
  /** Shown by most inboxes next to the subject; plain text. */
  preheader: string;
  heading: string;
  /** Already-escaped HTML for the body. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Already-escaped HTML for the line above the footer, e.g. how to get help. */
  footerNoteHtml?: string;
};

export function renderLayout({ preheader, heading, bodyHtml, cta, footerNoteHtml }: LayoutInput): string {
  const button = cta
    ? `<tr><td style="padding:8px 0 24px">
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;line-height:20px;padding:12px 22px;border-radius:10px">${escapeHtml(cta.label)}</a>
      </td></tr>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f9">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f9">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
      <tr><td style="padding:28px 32px 0">
        <span style="font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${BRAND}">PitchMyWeb</span>
      </td></tr>
      <tr><td style="padding:20px 32px 0">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:700;color:${INK}">${escapeHtml(heading)}</h1>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:15px;line-height:24px;color:${INK}">${bodyHtml}</td></tr>
          ${button}
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px;border-top:1px solid #e6e8f0">
        ${footerNoteHtml ? `<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:${MUTED}">${footerNoteHtml}</p>` : ""}
        <p style="margin:12px 0 0;font-size:12px;line-height:18px;color:${MUTED}">PitchMyWeb, a product of Claxon AI · <a href="https://pitchmyweb.in" style="color:${MUTED}">pitchmyweb.in</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
