import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { getPlan, getPrice } from "@/data/plans";
import { formatPrice } from "@/lib/utils";

// The home page's always-visible "See plans" bar. Rendered by the page itself,
// outside the defer-offscreen wrappers: content-visibility:auto contains
// paint, which turns the wrapper into the containing block for fixed
// children, so inside one this bar sat at the bottom of its section instead
// of the screen. Clears the iPhone home indicator via the safe-area inset.
export function StickyPlansBar() {
  const foreignAuto = formatPrice(getPrice(getPlan("auto"), "foreign"));
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink pb-[env(safe-area-inset-bottom)]">
      <Container className="flex items-center justify-between gap-4 py-3.5">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-white sm:text-[15px]">Start a campaign from {foreignAuto}</p>
          <p className="truncate text-[12px] text-white/60">India &amp; Global · Automatic or Direct</p>
        </div>
        <Link
          href="/pricing"
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-paper px-5 text-[13px] font-semibold text-ink transition hover:bg-mist"
        >
          See plans →
        </Link>
      </Container>
    </div>
  );
}
