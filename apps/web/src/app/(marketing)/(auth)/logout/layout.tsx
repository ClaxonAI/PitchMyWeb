import type { Metadata } from "next";
import { noIndex } from "@/lib/seo/metadata";

export const metadata: Metadata = { title: "Signing out", ...noIndex };

export default function LogoutLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
