import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function AnnouncementBar() {
  return (
    <div className="bg-ink text-white">
      {/* The height is pinned rather than left to min-h-10 + py-2. This bar
          sits above everything else on the page, so anything that changes its
          height moves the whole document: on a phone the sentence wraps to two
          lines in the metric-adjusted fallback face and back to one once
          Manrope arrives, and that 14px collapse was the only layout shift in
          the trace — the page's entire CLS. h-14 reserves the two-line box
          phones actually use; from sm up the sentence always fits one line. */}
      <Link
        href="/pricing"
        className="group mx-auto flex h-14 max-w-[1160px] items-center justify-center gap-2 px-4 text-center text-[12.5px] sm:h-10"
      >
        <span className="rounded-[5px] bg-lime px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink">NEW</span>
        <span className="text-white/75">Foreign campaigns are live: reach further, pay per batch.</span>
        <ArrowRight size={13} className="text-white/50 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
