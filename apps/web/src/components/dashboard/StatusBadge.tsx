import { Badge, type BadgeProps } from "@/components/dashboard-ui/badge";
import { cn } from "@/lib/utils";

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
  // LeadPipeline.stage — the per-lead delivery pipeline.
  SELECTED: "muted",
  BUILDING_SITE: "default",
  SITE_PUBLISHED: "outline",
  RECORDING: "default",
  VIDEO_UPLOADED: "outline",
  DELIVERY_QUEUED: "default",
  LINK_READY: "outline",
  SENT: "success",
  // WhatsAppMessage.status.
  QUEUED: "muted",
  DELIVERED: "success",
  READ: "success",
  CANCELLED: "muted",
};

/**
 * Enum values are written for the database, not for a customer: shouting
 * "SITE_PUBLISHED" at someone is a leaked implementation detail. Anything not
 * listed falls back to sentence case ("FOO_BAR" -> "Foo bar") so a new enum
 * value is merely unstyled, never raw.
 */
const LABEL_BY_STATUS: Record<string, string> = {
  SITE_READY: "Site ready",
  BUILDING_SITE: "Building site",
  SITE_PUBLISHED: "Site published",
  VIDEO_UPLOADED: "Video uploaded",
  DELIVERY_QUEUED: "Queued to send",
  LINK_READY: "Link ready",
  UNREACHABLE: "Unreachable",
};

export function statusLabel(status: string): string {
  const mapped = LABEL_BY_STATUS[status];
  if (mapped) return mapped;
  const words = status.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The dot repeats the badge's state as position+shape, so hue is never the only cue. */
const DOT_BY_VARIANT: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-dash-primary-foreground",
  secondary: "bg-dash-secondary-foreground",
  outline: "bg-dash-muted-foreground",
  success: "bg-dash-success",
  destructive: "bg-dash-destructive",
  muted: "bg-dash-muted-foreground",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = VARIANT_BY_STATUS[status] ?? "outline";
  return (
    <Badge variant={variant} className={cn("gap-1.5", className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT_BY_VARIANT[variant])} />
      {statusLabel(status)}
    </Badge>
  );
}
