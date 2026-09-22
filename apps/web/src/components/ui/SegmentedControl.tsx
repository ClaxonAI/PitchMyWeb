"use client";

import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: React.ReactNode };

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex rounded-xl bg-ink/5 p-1", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-10 flex-1 rounded-[9px] px-3 py-2 text-[13px] font-medium transition",
              active ? "bg-white text-ink shadow-[0_1px_3px_rgb(0_0_0/0.1)]" : "text-ink/60 hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
