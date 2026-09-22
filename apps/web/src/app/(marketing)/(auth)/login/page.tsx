import type { Metadata } from "next";
import { noIndex } from "@/lib/seo/metadata";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Sign in", ...noIndex };

export default function LoginPage() {
  return (
    <AuthForm mode="login" />
  );
}
