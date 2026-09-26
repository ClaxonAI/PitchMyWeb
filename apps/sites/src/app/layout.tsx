import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Bodoni_Moda, Cormorant_Garamond, Fraunces, Gelasio, Hanken_Grotesk, Instrument_Serif, Italiana, Manrope } from "next/font/google";
import "./globals.css";

const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
// Studio designs only. Georgia and Arial Narrow — what the original designs
// were drawn in — are missing on Android and on the recorder's Linux box, so
// the designs ship metric-compatible web fonts instead. Not preloaded: a
// browser only downloads them on pages that use them.
const gelasio = Gelasio({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], variable: "--font-gelasio", preload: false });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["400", "800", "900"], variable: "--font-barlow-condensed", preload: false });
// Studio, editorial and atelier designs. Same rule: only pages that use them download them.
// Variable fonts where Google has them: one file per style instead of one per
// weight. A request for many static weights (Cormorant's eight) is sometimes
// answered with extension-less "/l/font?kit=" URLs, which next/font cannot
// download, and the build fails.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", preload: false });
const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz", "SOFT"], variable: "--font-fraunces", preload: false });
const bodoni = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-bodoni", preload: false });
const italiana = Italiana({ subsets: ["latin"], weight: "400", variable: "--font-italiana", preload: false });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-cormorant", preload: false });

// Link previews (og:image) must be absolute URLs; without this Next.js would
// build them on localhost. The same variable apps/api uses for preview links.
function sitesPublicUrl(): URL | undefined {
  try {
    return process.env.SITES_PUBLIC_URL ? new URL(process.env.SITES_PUBLIC_URL) : undefined;
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: sitesPublicUrl(),
  title: "Website preview",
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: "#f6f2ea",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${instrument.variable} ${hanken.variable} ${gelasio.variable} ${barlowCondensed.variable} ${manrope.variable} ${fraunces.variable} ${cormorant.variable} ${bodoni.variable} ${italiana.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
