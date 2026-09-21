import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Gelasio, Hanken_Grotesk, Instrument_Serif } from "next/font/google";
import "./globals.css";

const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
// Studio designs only. Georgia and Arial Narrow — what the original designs
// were drawn in — are missing on Android and on the recorder's Linux box, so
// the designs ship metric-compatible web fonts instead. Not preloaded: a
// browser only downloads them on pages that use them.
const gelasio = Gelasio({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], variable: "--font-gelasio", preload: false });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["400", "800", "900"], variable: "--font-barlow-condensed", preload: false });

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
    <html lang="en" className={`${instrument.variable} ${hanken.variable} ${gelasio.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
