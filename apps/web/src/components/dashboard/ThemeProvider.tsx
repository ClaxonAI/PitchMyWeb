"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Thin re-export as its own client component: next-themes's ThemeProvider
// can only be used from a client component, and (dashboard)/layout.tsx
// (the thing that needs to render it) is a server component (it awaits
// requireSession()).
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </NextThemesProvider>
  );
}
