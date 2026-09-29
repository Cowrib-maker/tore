import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/application/actions/auth.actions";
import { BrandLink } from "@/components/layout/brand-link";
import { BRAND_NAME } from "@/components/brand/tokens";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { buttonVariants } from "@/components/ui/button";
import { WorkspaceNavLink } from "@/components/workspace/workspace-nav-link";
import type { WorkspaceIconKey } from "@/components/workspace/workspace-icons";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export type WorkspaceNavItem = {
  href: string;
  label: string;
  /**
   * A key into the shared WORKSPACE_ICONS registry, not a component
   * reference — WorkspaceShell is a Server Component and WorkspaceNavLink
   * (which renders the icon) is a Client Component, so the actual icon
   * component can never be passed as a prop across that boundary. See
   * workspace-icons.ts.
   */
  icon?: WorkspaceIconKey;
  /** Real count only (e.g. unread notifications) — never fabricated. */
  badge?: number;
};

export type WorkspaceNavGroup = {
  label?: string;
  items: WorkspaceNavItem[];
};

/**
 * Reserved for future per-role chrome variation (e.g. a different sidebar
 * tone for Student). Not yet consumed conditionally by this component —
 * every context currently renders through the same Layer 2 --workspace-*
 * tokens. Exposed now so Admin/Lawyer/Student can share one shell without
 * a later API break.
 */
export type WorkspaceContext = "admin" | "lawyer" | "student";

export interface WorkspaceShellProps {
  context: WorkspaceContext;
  children: ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
  };
  navGroups: WorkspaceNavGroup[];
  brand?: string;
  /** Sidebar footer tagline, e.g. a mission statement. Optional. */
  tagline?: string;
  locale: Locale;
  languageLabel: string;
  signOutLabel: string;
  navAriaLabel?: string;
  /** Self-service profile page. When set, the sidebar identity card links there. */
  profileHref?: string | null;
  /**
   * Optional persistent content row rendered above `children`, inside the
   * main content area (not the sidebar). Distinct page headers (a
   * greeting, a search field, a date-range control) belong here rather
   * than being hardcoded into the shell — most workspace pages that need
   * one render it themselves as page content instead.
   */
  header?: ReactNode;
  /** Optional right rail, shown only at wide (xl+) breakpoints. */
  rightRail?: ReactNode;
}

const SIDEBAR_STYLE = {
  "--sidebar": "var(--workspace-sidebar-bg)",
  "--sidebar-foreground": "var(--workspace-sidebar-fg)",
  "--sidebar-accent": "var(--primitive-neutral-0)",
  "--sidebar-accent-foreground": "var(--workspace-sidebar-bg)",
  "--sidebar-border": "color-mix(in srgb, var(--workspace-sidebar-fg) 10%, transparent)",
  "--sidebar-ring": "var(--workspace-accent)",
} as CSSProperties;

function initialOf(name?: string | null, email?: string | null): string {
  const source = (name ?? email ?? "?").trim();
  return source.length > 0 ? source.charAt(0).toUpperCase() : "?";
}

/**
 * Shared structural app chrome for authenticated workspace surfaces
 * (Admin today; Lawyer and Student are designed to migrate onto this same
 * component later without another structural rewrite). Built on the
 * existing shadcn Sidebar primitive (src/components/ui/sidebar.tsx) for
 * its offcanvas/Sheet responsive behavior, rather than hand-rolled
 * responsive logic.
 *
 * Visual identity comes entirely from the Layer 2 --workspace-* tokens
 * (src/app/globals.css, commit 401ee3a) via a scoped CSS-variable
 * override on the Sidebar's own --sidebar-* variables — the global
 * --sidebar token (used nowhere else in the app) is left untouched.
 */
export function WorkspaceShell({
  context,
  children,
  user,
  navGroups,
  brand = BRAND_NAME,
  tagline,
  locale,
  languageLabel,
  signOutLabel,
  navAriaLabel = "Main navigation",
  profileHref,
  header,
  rightRail,
}: WorkspaceShellProps) {
  const initial = initialOf(user.name, user.email);
  const identity = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-workspace-accent text-xs font-semibold text-white">
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-sidebar-foreground">
          {user.name ?? user.email ?? "—"}
        </p>
        {user.name && user.email ? (
          <p className="truncate text-[11px] text-sidebar-foreground/60">
            {user.email}
          </p>
        ) : null}
      </div>
    </>
  );

  return (
    <SidebarProvider
      data-workspace-context={context}
      style={SIDEBAR_STYLE}
      className="bg-workspace-background"
    >
      <Sidebar>
        <SidebarHeader className="px-4 py-4">
          <BrandLink brand={brand} logo={{ tone: "on-dark" }} />
        </SidebarHeader>

        <SidebarContent>
          {navGroups.map((group, groupIndex) => (
            <SidebarGroup key={group.label ?? groupIndex}>
              {group.label ? (
                <SidebarGroupLabel className="text-sidebar-foreground/50">
                  {group.label}
                </SidebarGroupLabel>
              ) : null}
              <SidebarGroupContent>
                <SidebarMenu aria-label={navAriaLabel}>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <WorkspaceNavLink item={item} />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="gap-2 px-3 pb-4">
          {tagline ? (
            <p className="px-1 text-[10px] font-medium tracking-wider text-sidebar-foreground/40 uppercase">
              {tagline}
            </p>
          ) : null}

          {profileHref ? (
            <Link
              href={profileHref}
              className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-2.5 transition-colors hover:bg-white/[0.08]"
            >
              {identity}
            </Link>
          ) : (
            <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
              {identity}
            </div>
          )}

          <div className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.08] p-1.5">
            <LanguageSwitcher
              locale={locale}
              label={languageLabel}
              className="min-w-0 flex-1 [&>button]:w-full [&>button]:border-white/15 [&>button]:bg-white/5 [&>button]:text-sidebar-foreground [&>button]:hover:border-white/25 [&>button]:hover:bg-white/10 [&_svg]:text-sidebar-foreground/70"
            />
            <ThemeToggle
              buttonClassName="border-white/10 bg-transparent text-sidebar-foreground hover:bg-white/10 hover:border-white/20"
            />
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label={signOutLabel}
                title={signOutLabel}
                className={cn(
                  buttonVariants({ variant: "outline", size: "icon-sm" }),
                  "cursor-pointer border-white/10 bg-transparent text-sidebar-foreground hover:bg-white/10 hover:border-white/20",
                )}
              >
                <LogOut />
              </button>
            </form>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-workspace-background">
        <div className="flex items-center gap-2 border-b border-black/5 px-4 py-2.5 md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-semibold text-ink">{brand}</span>
        </div>

        {header ? (
          <div className="border-b border-black/5 px-4 py-5 sm:px-8">
            {header}
          </div>
        ) : null}

        <div className="flex flex-1 items-start gap-6 px-4 pt-6 pb-10 sm:px-8">
          <div className="min-w-0 flex-1">{children}</div>
          {rightRail ? (
            <aside className="hidden w-80 shrink-0 xl:block">
              {rightRail}
            </aside>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
