import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-card border border-ink/8 bg-white", className)}>{children}</div>;
}
