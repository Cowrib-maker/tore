import Link from "next/link";
import {
  FileText,
  FolderOpen,
  MessageSquare,
  PenLine,
  Search,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavKey = "chat" | "cases" | "documents" | "research" | "drafting";

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
  { key: "research", label: "Судалгаа", icon: Search, placeholder: true },
  { key: "drafting", label: "Боловсруулалт", icon: PenLine, placeholder: true },
];

export function CaseWorkspaceLayout({
  children,
  active,
  documentsHref = "#case-documents",
}: {
  children: React.ReactNode;
  active: NavKey;
  documentsHref?: string;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside
        data-testid="case-workspace-nav"
        className="w-full shrink-0 rounded-2xl bg-[#0B1F3A] p-4 text-[#F7FAF8] lg:sticky lg:top-6 lg:w-56"
      >
        <p className="px-2 text-[10px] font-semibold tracking-[0.16em] text-[#C8A45D] uppercase">
          Ажлын орчин
        </p>
        <nav className="mt-4 space-y-1" aria-label="Хэргийн ажлын орчин">
          {NAV.map((item) => {
            const Icon = item.icon;
            const href =
              item.key === "documents" ? documentsHref : item.href;
            const className = cn(
              "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition",
              item.key === active
                ? "bg-white/10 text-white"
                : "text-white/70 hover:bg-white/8 hover:text-white",
              item.placeholder && "cursor-default opacity-55 hover:bg-transparent",
            );

            if (item.placeholder || !href) {
              return (
                <div key={item.key} className={className}>
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <span className="text-[10px] tracking-wide text-white/40">
                    Удахгүй
                  </span>
                </div>
              );
            }

            return (
              <Link key={item.key} href={href} className={className}>
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
