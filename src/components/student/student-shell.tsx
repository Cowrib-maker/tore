import Link from "next/link";
import {
  Bookmark,
  BriefcaseBusiness,
  FolderOpen,
  GraduationCap,
  Home,
  MessagesSquare,
  NotebookPen,
  PenSquare,
} from "lucide-react";
import type { ReactNode } from "react";

import { BRAND_LOGO_LANDING } from "@/components/brand/tokens";
import { BrandLink } from "@/components/layout/brand-link";
import {
  WorkspaceSideNav,
  type WorkspaceSideNavItem,
} from "@/components/workspace/workspace-side-nav";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

/**
 * Shared sidebar item list for every Student route that opts into the
 * persistent sidebar (see `sidebar` prop below). "Хуулийн сан" covers
 * the hub + track/lesson/quiz pages, since browsing tracks is that
 * feature; the rest mirror the hub's own honest quick-actions —
 * Тэмдэглэл/Хадгалсан have no backend yet and stay inert.
 */
export function studentSidebarItems(
  active: "home" | "library",
): WorkspaceSideNavItem[] {
  return [
    { key: "home", icon: Home, label: "Нүүр", href: "/student", active: active === "home" },
    { key: "ai", icon: MessagesSquare, label: "AI туслах", href: "/#chat" },
    {
      key: "library",
      icon: GraduationCap,
      label: "Хуулийн сан",
      href: "/student#tracks",
      active: active === "library",
    },
    { key: "case-study", icon: BriefcaseBusiness, label: "Кейс судалгаа", comingSoonLabel: "Тун удахгүй" },
    { key: "tests", icon: PenSquare, label: "Шалгалтын тест", href: "/student#modules" },
    { key: "materials", icon: FolderOpen, label: "Хичээлийн материал", href: "/student#modules" },
    { key: "notes", icon: NotebookPen, label: "Тэмдэглэл", comingSoonLabel: "Тун удахгүй" },
    { key: "saved", icon: Bookmark, label: "Хадгалсан", comingSoonLabel: "Тун удахгүй" },
  ];
}

export function StudentShell({
  brand,
  backHref,
  backLabel,
  children,
  sidebar,
  sidebarFooter,
  wideContent,
}: {
  brand: Dictionary["common"]["brand"];
  backHref: string;
  backLabel: string;
  children: ReactNode;
  /**
   * Optional persistent sidebar nav. Omitted entirely on routes that
   * don't opt in (e.g. the in-progress case-study page), so this stays
   * a purely additive, backward-compatible layout change — every
   * existing call site renders byte-identical unless it passes this.
   */
  sidebar?: WorkspaceSideNavItem[];
  sidebarFooter?: ReactNode;
  /**
   * Lets the hub page use the full available width next to the sidebar
   * (matching the Firm/Team workspace composition) — lesson/quiz pages
   * keep the narrower max-w-3xl reading column by omitting this.
   */
  wideContent?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#0A0F14]">
      <header className="border-b border-[#0B1F3A]/8 bg-[#F7F6F2]/90 backdrop-blur-xl">
        <div
          className={cn(
            "mx-auto flex h-16 items-center justify-between px-5 sm:px-8",
            sidebar ? "max-w-6xl" : "max-w-3xl",
          )}
        >
          <BrandLink brand={brand} logo={BRAND_LOGO_LANDING} />
          <Link
            href={backHref}
            className="text-[13px] font-medium text-[#5C6570] transition hover:text-[#0B1F3A]"
          >
            {backLabel}
          </Link>
        </div>
      </header>
      <main
        className={cn(
          "mx-auto px-5 py-12 sm:px-8 sm:py-16",
          sidebar ? "max-w-6xl" : "max-w-3xl",
        )}
      >
        {sidebar ? (
          <div className="grid gap-6 lg:grid-cols-[272px_1fr] lg:items-start">
            <WorkspaceSideNav
              icon={GraduationCap}
              title="TORE Student"
              subtitle="Хуулийн оюутан"
              items={sidebar}
              footer={sidebarFooter}
              className="lg:sticky lg:top-24"
            />
            <div className={cn("min-w-0", wideContent ? "" : "max-w-3xl")}>{children}</div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
