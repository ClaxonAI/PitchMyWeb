import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function LogoWordmark({ className }: { className?: string }) {
  // 3x the 48px display height, as WebP: ~14 KB instead of the 63 KB source PNG.
  return <Image src="/images/logo.webp" alt="PitchMyWeb" width={144} height={48} priority className={cn("h-12 w-auto object-contain", className)} />;
}

export function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2.5" aria-label="PitchMyWeb home">
      {tone === "dark" ? <span className="display text-[21px] leading-none text-white">PitchMyWeb</span> : <LogoWordmark />}
    </Link>
  );
}
