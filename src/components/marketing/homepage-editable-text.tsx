"use client";

import { createContext, useContext, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Admin-only inline-edit wiring for the live homepage preview.
 * When no provider (or a null value) is present — i.e. on the real public
 * homepage — `EditableText` is a pure passthrough and renders nothing extra,
 * so production markup is byte-identical to before this feature existed.
 */
export type HomepageEditController = {
  getValue: (path: string) => string;
  setValue: (path: string, value: string) => void;
};

const HomepageEditContext = createContext<HomepageEditController | null>(null);
export const HomepageEditProvider = HomepageEditContext.Provider;

export function EditableText({
  path,
  children,
  as = "span",
  className,
}: {
  path: string;
  children: ReactNode;
  as?: "span" | "div";
  className?: string;
}) {
  const ctrl = useContext(HomepageEditContext);

  if (!ctrl) {
    return <>{children}</>;
  }

  const Tag = as;
  const NBSP = String.fromCharCode(160);

  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      className={cn(
        "cursor-text rounded-sm outline-none transition-colors hover:bg-amber-200/40 focus:bg-amber-200/60 focus:ring-2 focus:ring-amber-400/70",
        className,
      )}
      onClick={(e) => {
        // The preview reuses real homepage markup (links, buttons) — while
        // editing we want a click to place the caret, never to navigate or
        // submit.
        e.preventDefault();
        e.stopPropagation();
      }}
      onBlur={(e) => {
        const raw = e.currentTarget.textContent ?? "";
        const next = raw.split(NBSP).join(" ");
        if (next !== ctrl.getValue(path)) {
          ctrl.setValue(path, next);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && Tag === "span") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {children}
    </Tag>
  );
}
