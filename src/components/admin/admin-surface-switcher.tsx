"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Shield } from "lucide-react";

import { cn } from "@/lib/utils";

const DESTINATIONS = [
  { href: "/admin/dashboard", label: "Admin Panel" },
  { href: "/lawyer/workspace", label: "Lawyer Workspace" },
  { href: "/student", label: "TORE Student" },
  { href: "/client/dashboard", label: "Citizen Dashboard" },
  { href: "/legal-ai", label: "Legal AI" },
] as const;

/**
 * ADMIN-only global surface switcher. Fixed-position (same pattern as
 * FloatingLegalAiWidget) so it renders on top of every page's own chrome —
 * DashboardShell, LawyerWorkspaceFrame, StudentShell, or none — without
 * needing to be wired into each of their separate nav components.
 *
 * Pure navigation: following a link here does not change the signed-in
 * user's role or start impersonation. It's the same ADMIN session, just
 * visiting a route its role is now permitted to reach.
 */
export function AdminSurfaceSwitcher() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

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

  return (
    <div
      ref={rootRef}
      data-testid="admin-surface-switcher"
      className="fixed top-4 left-4 z-50 sm:top-6 sm:left-6"
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Admin: switch surface"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-foreground shadow-sm",
          "transition-[border-color,background-color] duration-200",
          "hover:border-ring/40 hover:bg-accent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          open && "border-ring/40 bg-accent",
        )}
      >
        <Shield className="size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="text-sm font-medium tracking-tight">Admin</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200",
            open && "rotate-180",
          )}
          strokeWidth={1.75}
        />
      </button>

      {open ? (
        <ul
          id={listId}
          role="menu"
          aria-label="Switch surface"
          className={cn(
            "absolute left-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-popover py-1.5",
            "shadow-[0_16px_40px_-28px_rgba(15,61,51,0.55)] dark:shadow-[0_16px_40px_-28px_rgba(0,0,0,0.6)]",
            "animate-in fade-in-0 zoom-in-95 origin-top-left duration-150",
          )}
        >
          <li className="px-3 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Switch surface
          </li>
          {DESTINATIONS.map((item) => (
            <li key={item.href} role="none">
              <Link
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export { DESTINATIONS as ADMIN_SURFACE_SWITCHER_DESTINATIONS };
