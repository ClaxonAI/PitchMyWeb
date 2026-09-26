import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { siteUrl } from "@/lib/seo/site-url";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  // opsz keeps the display optical size the headlines are drawn at. The SOFT
  // axis it used to carry nearly doubled the download (263 KB -> 145 KB for
  // both styles) for a barely visible rounding of the terminals.
  axes: ["opsz"],
  style: ["normal", "italic"],
  // next/font's automatic fallback is sized to match Fraunces' x-height, which
  // leaves it 24.5% too wide and re-wrapped the headline when the real font
  // arrived. Ours is sized to match advance width instead — see the
  // "Fraunces Fallback Tuned" @font-face in globals.css for the derivation.
  adjustFontFallback: false,
  fallback: ["Fraunces Fallback Tuned", "Georgia", "serif"],
});

// viewport-fit=cover lets the fixed bars reach the screen edges on phones
// with a notch or home indicator; they pad themselves with env(safe-area-*).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  // Absolute-URL base for every canonical, og:image and og:url below. Read
  // from one place so the sitemap and robots.txt cannot drift from it; see
  // lib/seo/site-url.ts.
  metadataBase: new URL(siteUrl),
  title: {
    default: "PitchMyWeb — Show them the website before they ask for one",
    template: "%s · PitchMyWeb",
  },
  description:
    "PitchMyWeb finds local businesses without a website, builds each one a real sample site and demo, and pitches it from your WhatsApp.",
  applicationName: "PitchMyWeb",
  // Not a canonical: `alternates` is inherited by every route, so setting one
  // here would point the whole site at "/". Pages set their own via
  // lib/seo/metadata.ts’s pageMetadata().
  openGraph: {
    type: "website",
    siteName: "PitchMyWeb",
    locale: "en_IN",
    title: "PitchMyWeb — Show them the website before they ask for one",
    description: "Pitch the website, not the idea.",
  },
  twitter: {
    card: "summary_large_image",
    title: "PitchMyWeb — Show them the website before they ask for one",
    description: "Pitch the website, not the idea.",
  },
  // Defaults for the whole site. The private routes turn this off for
  // themselves (see lib/seo/metadata.ts’s noIndex); robots.txt blocks
  // them too, and the two have to agree.
  //
  // The googleBot block is what earns a large image in the search result and
  // an untruncated snippet — Google caps both conservatively without it.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};
// Kept deliberately minimal: only <html>/<body>, fonts, and base metadata.
// The marketing chrome (announcement bar/navbar/footer) lives in
// (marketing)/layout.tsx and must not wrap (dashboard) routes — see that
// file and (dashboard)/layout.tsx for where it went.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning is next-themes' own documented requirement:
    // it sets the "dark" class + color-scheme style on <html> via a
    // client-side effect (from within the (dashboard) layout's
    // ThemeProvider, arbitrarily deep in the tree — next-themes always
    // targets document.documentElement directly, regardless of where the
    // provider is mounted), which legitimately differs from the
    // server-rendered markup. This tells React that specific mismatch is
    // expected, without suppressing hydration warnings anywhere else.
    <html lang="en" className={`${manrope.variable} ${fraunces.variable}`} suppressHydrationWarning>
      {/* ClerkProvider lives in (marketing)/(auth)/layout.tsx, the only pages
          that sign people in; see that file. */}
      <body>{children}</body>
    </html>
  );
}
