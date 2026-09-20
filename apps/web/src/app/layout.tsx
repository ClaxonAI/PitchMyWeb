import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pitchmyweb.com"),
  title: {
    default: "PitchMyWeb — Show them the website before they ask for one",
    template: "%s · PitchMyWeb",
  },
  description:
    "PitchMyWeb finds local businesses without a website, builds each one a real sample site and demo, and pitches it from your WhatsApp.",
  openGraph: {
    title: "PitchMyWeb",
    description: "Pitch the website, not the idea.",
    type: "website",
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
      <body>
        <ClerkProvider publishableKey={process.env.CLERK_PUBLISHABLE_KEY}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
