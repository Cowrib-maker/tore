"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Globe2 } from "lucide-react";

import { setLocaleAction } from "@/application/actions/locale.actions";
import { localeMeta, type Locale } from "@/i18n/config";
import { localeMenuOrder, writeStoredLocale } from "@/i18n/client-storage";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  locale: Locale;
  label: string;
  className?: string;
};

export function LanguageSwitcher({
  locale,
  label,
  className,
}: LanguageSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, localeMenuOrder.indexOf(locale)),
  );
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = localeMeta[locale];

  function openMenu() {
    setActiveIndex(Math.max(0, localeMenuOrder.indexOf(locale)));
    setOpen(true);
  }

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

  useEffect(() => {
    if (open) {
      document.getElementById(listId)?.focus();
    }
  }, [open, listId]);

  const select = useCallback(
    (next: Locale) => {
      setOpen(false);
      if (next === locale) return;

      writeStoredLocale(next);
      startTransition(async () => {
        await setLocaleAction(next);
        router.refresh();
      });
    },
    [locale, router],
  );

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }
  }

  function onListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % localeMenuOrder.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (i) => (i - 1 + localeMenuOrder.length) % localeMenuOrder.length,
      );
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const code = localeMenuOrder[activeIndex];
      if (code) select(code);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(localeMenuOrder.length - 1);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        disabled={pending}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "group inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[#0F3D33]/12 bg-white/90 px-2.5 text-[#0F3D33]",
          "transition-[border-color,background-color,box-shadow] duration-200",
          "hover:border-[#0F3D33]/28 hover:bg-[#F4F8F6]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D33]/25",
          open && "border-[#0F3D33]/28 bg-[#F4F8F6]",
          pending && "opacity-70",
        )}
      >
        <Globe2
          className="size-3.5 shrink-0 text-[#0F3D33]/70 transition-colors group-hover:text-[#0F3D33]"
          strokeWidth={1.75}
        />
        <span className="min-w-0 text-sm font-medium tracking-tight">
          <span className="sm:hidden">{current.shortLabel}</span>
          <span className="hidden sm:inline">{current.nativeLabel}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-[#0F3D33]/45 transition-transform duration-200",
            open && "rotate-180",
          )}
          strokeWidth={1.75}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listId}-${localeMenuOrder[activeIndex]}`}
          onKeyDown={onListKeyDown}
          className={cn(
            "absolute right-0 z-50 mt-2 w-[min(12.5rem,calc(100vw-1.5rem))] overflow-hidden",
            "rounded-xl border border-[#0F3D33]/12 bg-white py-1.5",
            "shadow-[0_16px_40px_-28px_rgba(15,61,51,0.55)]",
            "animate-in fade-in-0 zoom-in-95 origin-top-right duration-150",
          )}
        >
          <li className="px-3 pb-1.5 pt-1 text-[10px] font-semibold tracking-[0.12em] text-[#5A6B64] uppercase">
            {label}
          </li>
          {localeMenuOrder.map((code, index) => {
            const meta = localeMeta[code];
            const selected = code === locale;
            const highlighted = index === activeIndex;
            return (
              <li key={code} role="presentation">
                <button
                  id={`${listId}-${code}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors",
                    highlighted && "bg-[#F4F8F6]",
                    selected && "text-[#0F3D33]",
                    !selected && "text-[#0A0F14]",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(code)}
                >
                  <span className="flex-1 font-medium tracking-tight">
                    {meta.nativeLabel}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums text-[11px] font-medium tracking-wide text-[#5A6B64]",
                      selected && "text-[#0F3D33]/70",
                    )}
                  >
                    {meta.code}
                  </span>
                  <span className="flex size-4 items-center justify-center">
                    {selected && (
                      <Check
                        className="size-3.5 text-[#0F3D33]"
                        strokeWidth={2.5}
                      />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
