import type { Metadata } from "next";
import { noIndex } from "@/lib/seo/metadata";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Create an account", ...noIndex };

export default function RegisterPage() {
  return (
    <AuthForm mode="register" />
  );
}
