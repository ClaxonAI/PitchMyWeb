import type { Metadata } from "next";
import { noIndex } from "@/lib/seo/metadata";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password", ...noIndex };

// Outside the (auth) group on purpose: resetting a password needs no Clerk,
// so this page doesn't load its JavaScript.
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
