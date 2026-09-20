import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function AnnouncementBar() {
  return (
    <div className="bg-ink text-white">
      <Link
        href="/pricing"
        className="group mx-auto flex max-w-[1160px] items-center justify-center gap-2 px-4 py-2 text-center text-[12.5px]"
      >
        <span className="rounded-[5px] bg-lime px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink">NEW</span>
        <span className="text-white/75">Foreign campaigns are live: reach further, pay per batch.</span>
        <ArrowRight size={13} className="text-white/50 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
