import { Badge, type BadgeProps } from "@/components/dashboard-ui/badge";

const VARIANT_BY_STATUS: Record<string, NonNullable<BadgeProps["variant"]>> = {
  DRAFT: "muted",
  READY: "outline",
  RUNNING: "default",
  PROCESSING: "default",
  COMPLETED: "success",
  FAILED: "destructive",
  NEW: "muted",
  ANALYZED: "outline",
  SITE_READY: "outline",
  PITCHED: "default",
  REPLIED: "default",
  INTERESTED: "success",
  NEGOTIATING: "success",
  WON: "success",
  LOST: "destructive",
  PENDING: "muted",
  GENERATED: "success",
  // Business.websiteVerificationStatus (Phase 2C) — UNVERIFIED is
  // deliberately not shown here (see DiscoverForm/campaign detail usage):
  // most businesses sit in that state until the rolling check catches up,
  // so a badge for it everywhere would be pure noise.
  LIVE: "success",
  PARKED: "destructive",
  DEAD: "destructive",
  UNREACHABLE: "muted",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANT_BY_STATUS[status] ?? "outline"}>{status.replaceAll("_", " ")}</Badge>;
}
