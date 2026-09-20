"use client";

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import type { WebsiteVerificationStatus } from "@/lib/api-client";

export function WebsiteVerificationBadge({ status }: { status: WebsiteVerificationStatus | null | undefined }) {
  if (!status || status === "UNVERIFIED") return null;
  return <StatusBadge status={status} />;
}
