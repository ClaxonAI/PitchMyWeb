"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { countries, findCountry } from "@/data/countries";
import { cn, formatInr } from "@/lib/utils";

/** Approximate rendered height of the open menu (search + list + footer). */
const MENU_HEIGHT = 360;

/**
 * Searchable country picker (combobox + listbox pattern).
 * Keyboard: ↑/↓ to move, Enter to pick, Esc to close, type to filter.
 */
export function CountrySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const country = findCountry(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [dropUp, setDropUp] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const listId = `${id}-list`;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => [c.name, c.code, c.currency].some((s) => s.toLowerCase().includes(q)));
  }, [query]);

  const openMenu = () => {
    setQuery("");
    setActive(Math.max(0, countries.findIndex((c) => c.code === value)));
    // Open upwards when there isn't room for the menu below the trigger.
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setDropUp(below < MENU_HEIGHT && rect.top > below);
    }
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const pick = (code: string) => {
    onChange(code);
    close();
  };

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) pick(results[active].code);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        // No aria-label on purpose. The button's visible text is "Target
        // country", the country name, and the exchange-rate chip; an
        // aria-label replaces all of that with its own string, and the one
        // that used to be here ("Target country: <name>") left out the rate
        // and added a colon. WCAG 2.5.3 (Label in Name) requires the visible
        // label to appear in the accessible name, so that failed F96 — voice
        // control users saying what they can see would not match the control.
        //
        // Letting the name compute from the button's own contents makes the
        // two identical by construction, so they cannot drift again. CodeChip
        // is aria-hidden, and the rate chip is display:none under 380px, so
        // each viewport's name matches exactly what that viewport shows.
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openMenu();
          }
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border bg-white p-2.5 pr-3 text-left transition",
          open ? "border-primary ring-4 ring-primary/10" : "border-ink/10 hover:border-ink/20",
        )}
      >
        <CodeChip code={country.code} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-ink/60">Target country</span>
          <span className="block truncate text-[15px] font-medium">{country.name}</span>
        </span>
        <span className="hidden rounded-lg bg-primary/8 px-2 py-1 font-mono text-[11px] whitespace-nowrap text-primary min-[380px]:inline">
          1 {country.currency} ≈ {formatInr(country.inrRate)}
        </span>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-ink/60 transition-transform duration-200", open && "rotate-180 text-primary")}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute inset-x-0 z-40 animate-pop overflow-hidden rounded-2xl border border-ink/8 bg-white shadow-[0_24px_60px_-12px_rgb(20_20_60/0.25)]",
            dropUp ? "bottom-[calc(100%+8px)] origin-bottom" : "top-[calc(100%+8px)] origin-top",
          )}
        >
          <div className="flex items-center gap-2.5 border-b border-ink/6 px-4">
            <Search size={15} className="shrink-0 text-ink/60" />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${id}-${results[active].code}` : undefined}
              aria-label="Search countries"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
              placeholder="Search country or currency"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-ink/60"
            />
          </div>

          <ul ref={listRef} id={listId} role="listbox" aria-label="Countries" className="scrollbar-thin max-h-64 overflow-y-auto overscroll-contain p-1.5">
            {results.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-ink/60">No country matches “{query}”</li>
            )}
            {results.map((c, i) => {
              const selected = c.code === value;
              return (
                <li
                  key={c.code}
                  id={`${id}-${c.code}`}
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(c.code)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors",
                    i === active && "bg-mist",
                  )}
                >
                  <CodeChip code={c.code} small active={selected} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", selected ? "font-semibold" : "font-medium")}>
                      {c.name}
                    </span>
                    <span className="block font-mono text-[11px] text-ink/60">
                      1 {c.currency} ≈ {formatInr(c.inrRate)}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-ink/60">{c.currency}</span>
                  <span className="grid w-4 place-items-center">
                    {selected && <Check size={15} className="text-primary" strokeWidth={2.5} />}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="border-t border-ink/6 bg-mist-2 px-4 py-2 text-[11px] text-ink/60">
            Rates are approximate · ↑↓ to move, Enter to select
          </p>
        </div>
      )}
    </div>
  );
}

function CodeChip({ code, small = false, active = false }: { code: string; small?: boolean; active?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-xl font-mono font-medium transition-colors",
        small ? "size-9 text-[11px]" : "size-10 text-[13px]",
        active ? "bg-primary text-white" : "bg-mist text-ink/70",
      )}
    >
      {code}
    </span>
  );
}
