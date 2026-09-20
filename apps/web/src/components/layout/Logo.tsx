import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return <Image src="/images/mainlogo.png" alt="" aria-hidden width={36} height={36} className={cn("size-9 object-cover object-center", className)} />;
}

export function LogoWordmark({ className }: { className?: string }) {
  return <Image src="/images/mainlogo.png" alt="PitchMyWeb" width={180} height={48} className={cn("h-12 w-auto object-contain", className)} />;
}

export function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="PitchMyWeb home">
      {tone === "dark" ? <span className="display text-[21px] leading-none text-white">PitchMyWeb</span> : <LogoWordmark />}
    </Link>
  );
}
