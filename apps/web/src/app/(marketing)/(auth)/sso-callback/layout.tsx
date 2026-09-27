import type { Metadata } from "next";
import { noIndex } from "@/lib/seo/metadata";

// The OAuth return page: nothing to index, same as /logout.
export const metadata: Metadata = { title: "Signing in", ...noIndex };

export default function SsoCallbackLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
