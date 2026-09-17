"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Check, ChevronDown, Laptop, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

type ThemeOption = "system" | "light" | "dark";

const OPTIONS: Array<{ value: ThemeOption; label: string; icon: typeof Sun }> = [
  { value: "system", label: "Систем", icon: Laptop },
  { value: "light", label: "Цайвар", icon: Sun },
  { value: "dark", label: "Бараан", icon: Moon },
];

type ThemeToggleProps = {
  label?: string;
  className?: string;
  /** Overrides the trigger button's own color classes — for contexts like
   * a permanently-dark sidebar where the default card/border tokens
   * wouldn't read correctly against a fixed dark background. */
  buttonClassName?: string;
};

/**
 * System/Light/Dark selector, visually matching LanguageSwitcher's dropdown
 * pattern (same trigger/menu shape) but built on semantic color tokens so it
 * renders correctly in both themes from the start.
 */
export function ThemeToggle({
  label = "Харагдац",
  className,
  buttonClassName,
}: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Avoid rendering theme-dependent icon/label before mount — the resolved
  // theme is only known client-side, and guessing would mismatch hydration.
  const current = mounted
    ? (OPTIONS.find((option) => option.value === theme) ?? OPTIONS[0])
    : OPTIONS[0];
  const CurrentIcon = current.icon;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "group inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-foreground",
          "transition-[border-color,background-color,box-shadow] duration-200",
          "hover:border-ring/40 hover:bg-accent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          open && "border-ring/40 bg-accent",
          buttonClassName,
        )}
      >
        <CurrentIcon
          className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="hidden text-sm font-medium tracking-tight sm:inline">
          {current.label}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200",
            open && "rotate-180",
          )}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          className={cn(
            "absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-popover py-1.5",
            "shadow-[0_16px_40px_-28px_rgba(15,61,51,0.55)] dark:shadow-[0_16px_40px_-28px_rgba(0,0,0,0.6)]",
            "animate-in fade-in-0 zoom-in-95 origin-top-right duration-150",
          )}
        >
          <li className="px-3 pb-1.5 pt-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {label}
          </li>
          {OPTIONS.map((option) => {
            const selected = mounted && theme === option.value;
            const Icon = option.icon;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors",
                    "hover:bg-accent",
                    selected ? "text-foreground" : "text-foreground/80",
                  )}
                  onClick={() => {
                    setTheme(option.value);
                    setOpen(false);
                  }}
                >
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="flex-1 font-medium tracking-tight">
                    {option.label}
                  </span>
                  <span className="flex size-4 items-center justify-center">
                    {selected && (
                      <Check className="size-3.5 text-foreground" strokeWidth={2.5} />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <span className="sr-only" aria-live="polite">
        {mounted
          ? `${label}: ${current.label}${
              theme === "system" && resolvedTheme
                ? resolvedTheme === "dark"
                  ? " (бараан)"
                  : " (цайвар)"
                : ""
            }`
          : null}
      </span>
    </div>
  );
}
