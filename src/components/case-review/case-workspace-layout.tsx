import Link from "next/link";
import {
  Clock,
  FileText,
  FolderOpen,
  MessageSquare,
  PenLine,
  Search,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavKey =
  | "chat"
  | "cases"
  | "documents"
  | "analyze"
  | "research"
  | "drafting"
  | "timeline";

const NAV: Array<{
  key: NavKey;
  href?: string;
  label: string;
  icon: typeof MessageSquare;
  placeholder?: boolean;
}> = [
  { key: "chat", href: "/legal-ai", label: "AI Туслах", icon: MessageSquare },
  {
    key: "cases",
    href: "/lawyer/workspace/cases",
    label: "Миний хэргүүд",
    icon: FolderOpen,
  },
  {
    key: "documents",
    href: "#case-documents",
    label: "Баримт бичиг",
    icon: FileText,
  },
  {
    key: "analyze",
    label: "Хэрэг шинжлэх",
    icon: Sparkles,
    placeholder: true,
  },
  { key: "research", label: "Судалгаа", icon: Search, placeholder: true },
  {
    key: "drafting",
    label: "Боловсруулалт",
    icon: PenLine,
    placeholder: true,
  },
  { key: "timeline", label: "Хугацааны хэлхээс", icon: Clock, placeholder: true },
];

export function CaseWorkspaceLayout({
  children,
  active,
  documentsHref = "#case-documents",
  analyzeHref,
  draftHref,
  timelineHref,
}: {
  children: React.ReactNode;
  active: NavKey;
  documentsHref?: string;
  /** When set (a case is open), the "Хэрэг шинжлэх" tab becomes a real
   * link instead of the pre-Sprint-13 "Удахгүй" placeholder. */
  analyzeHref?: string;
  draftHref?: string;
  timelineHref?: string;
}) {
  const hrefOverride: Partial<Record<NavKey, string | undefined>> = {
    documents: documentsHref,
    analyze: analyzeHref,
    drafting: draftHref,
    timeline: timelineHref,
  };
  return (
    <div className="flex flex-col gap-4">
      {/* Secondary, in-page nav for the case-review workflow itself (chat /
          documents / analyze / research / drafting / timeline) — a
          horizontal bar, not a sidebar, so it never competes visually with
          WorkspaceShell's single global Lawyer sidebar. */}
      <nav
        data-testid="case-workspace-nav"
        aria-label="Хэргийн ажлын орчин"
        className="flex flex-wrap items-center gap-1.5 overflow-x-auto rounded-2xl border border-[#0B1F3A]/10 bg-white p-2 shadow-[0_1px_2px_rgba(11,31,58,0.04)]"
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          const resolvedHref = hrefOverride[item.key] ?? item.href;
          const isPlaceholder = item.placeholder && !resolvedHref;
          const href = resolvedHref;
          const className = cn(
            "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
            item.key === active
              ? "bg-[#0B1F3A] text-white"
              : "text-[#5C6570] ring-1 ring-[#0B1F3A]/10 hover:bg-[#0B1F3A]/5",
            isPlaceholder && "cursor-default opacity-55 hover:bg-transparent",
          );

          if (isPlaceholder || !href) {
            return (
              <div key={item.key} className={className}>
                <Icon className="size-3.5 shrink-0" />
                <span>{item.label}</span>
                <span className="text-[9px] tracking-wide text-[#8A939D]">
                  Удахгүй
                </span>
              </div>
            );
          }

          return (
            <Link key={item.key} href={href} className={className}>
              <Icon className="size-3.5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
