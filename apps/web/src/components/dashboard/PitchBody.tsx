import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A stored pitch keeps the {{site_link}} placeholder; the real preview URL is
 * substituted per lead when the message is actually sent (see the API's
 * fillSiteLink). Printing the raw token at a customer reads as a bug in their
 * pitch, so it is shown as a labelled chip instead — the text they see here
 * then matches what the recipient gets.
 */
const SITE_LINK_PLACEHOLDER = "{{site_link}}";

export function PitchBody({ content, className }: { content: string; className?: string }) {
  const parts = content.split(SITE_LINK_PLACEHOLDER);

  return (
    <p className={cn("whitespace-pre-wrap text-dash-muted-foreground", className)}>
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 ? (
            <span
              title="Replaced with this lead's demo site link when the pitch is sent"
              className="mx-0.5 inline-flex items-center gap-1 rounded-full bg-dash-secondary px-2 py-0.5 align-baseline text-xs font-medium text-dash-primary"
            >
              <Link2 className="size-3" aria-hidden />
              demo link
            </span>
          ) : null}
        </span>
      ))}
    </p>
  );
}
