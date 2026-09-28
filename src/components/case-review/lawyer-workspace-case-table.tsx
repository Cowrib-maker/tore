"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { LawyerWorkspaceCaseCard } from "@/application/use-cases/case-review";
import { CaseFileAnalysisStatus } from "@/domain/entities/case-file";
import { formatRelativeMn } from "@/lib/format-relative-mn";
import { cn } from "@/lib/utils";

/** Stable per-domain accent — LegalDomain is a fixed, real enum on
 * CaseFile, never inferred or fabricated per row. */
const DOMAIN_ACCENT: Record<string, { dot: string; badge: string }> = {
  CIVIL: { dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  CRIMINAL: { dot: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200" },
  ADMINISTRATIVE: {
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-800 border-amber-200",
  },
  CONSTITUTIONAL: {
    dot: "bg-purple-500",
    badge: "bg-purple-50 text-purple-800 border-purple-200",
  },
  PROCEDURAL: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  UNKNOWN: { dot: "bg-slate-400", badge: "bg-slate-50 text-slate-700 border-slate-200" },
};

function domainAccent(domain: string) {
  return DOMAIN_ACCENT[domain] ?? DOMAIN_ACCENT.UNKNOWN!;
}

function statusTone(status: string): string {
  if (status === CaseFileAnalysisStatus.ANALYSIS_FAILED) {
    return "bg-red-50 text-red-700 border-red-200";
  }
  if (status === CaseFileAnalysisStatus.NOT_ANALYZED) {
    return "bg-amber-50 text-amber-800 border-amber-200";
  }
  return "bg-emerald-50 text-emerald-800 border-emerald-200";
}

type FilterTab = "ALL" | "ANALYZED" | "NOT_ANALYZED";

export function LawyerWorkspaceCaseTable({
  cases,
  now,
}: {
  cases: LawyerWorkspaceCaseCard[];
  /** Server-computed reference instant (see lawyer-workspace-home.tsx) —
   * every row's relative-time text renders from this single value, never
   * from Date.now() called during this "use client" component's own
   * render, so server and client output can never disagree. */
  now: number;
}) {
  const [tab, setTab] = useState<FilterTab>("ALL");

  const counts = useMemo(
    () => ({
      ALL: cases.length,
      ANALYZED: cases.filter((item) => item.status === CaseFileAnalysisStatus.ANALYZED)
        .length,
      NOT_ANALYZED: cases.filter(
        (item) => item.status === CaseFileAnalysisStatus.NOT_ANALYZED,
      ).length,
    }),
    [cases],
  );

  const visible = useMemo(() => {
    const filtered =
      tab === "ALL"
        ? cases
        : cases.filter((item) =>
            tab === "ANALYZED"
              ? item.status === CaseFileAnalysisStatus.ANALYZED
              : item.status === CaseFileAnalysisStatus.NOT_ANALYZED,
          );
    return filtered.slice(0, 8);
  }, [cases, tab]);

  return (
    <section className="overflow-hidden rounded-xl border border-[#0B1F3A]/10 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#0B1F3A]/8 px-4 py-3">
        <div>
          <h2 className="text-[15px] font-bold text-[#0B1F3A]">Сүүлийн хэргүүд</h2>
          <p className="text-[11px] text-[#8A939D]">
            Таны нээлттэй болон шинжилгээ хийгдсэн хэргүүд
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[#0B1F3A]/10 bg-[#F8FAFC] p-0.5 text-[12px]">
          <TabButton active={tab === "ALL"} onClick={() => setTab("ALL")}>
            Бүгд ({counts.ALL})
          </TabButton>
          <TabButton active={tab === "ANALYZED"} onClick={() => setTab("ANALYZED")}>
            Шинжилсэн ({counts.ANALYZED})
          </TabButton>
          <TabButton
            active={tab === "NOT_ANALYZED"}
            onClick={() => setTab("NOT_ANALYZED")}
          >
            Шинжлээгүй ({counts.NOT_ANALYZED})
          </TabButton>
        </div>
      </div>

      {visible.length === 0 ? (
        <div
          data-testid="workspace-empty-cases"
          className="px-6 py-12 text-center"
        >
          <p className="font-semibold text-[#0B1F3A]">Одоогоор хэрэг алга.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#5C6570]">
            Шинэ хэрэг үүсгээд ажлаа эндээс эхлүүлээрэй.
          </p>
          <Link
            href="/lawyer/workspace/cases#create-case"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-[#0B5CFF] px-4 text-sm font-medium text-white"
          >
            Шинэ хэрэг үүсгэх
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#0B1F3A]/8 bg-[#F8FAFC] text-[10px] font-semibold tracking-wider text-[#8A939D] uppercase">
                <th className="px-4 py-2.5">Хэргийн нэр</th>
                <th className="px-3 py-2.5">Төрөл</th>
                <th className="px-3 py-2.5">Төлөв байдал</th>
                <th className="px-3 py-2.5">Сүүлд шинэчлэгдсэн</th>
                <th className="px-4 py-2.5 text-right">Үйлдэл</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0B1F3A]/6 text-sm">
              {visible.map((item) => {
                const accent = domainAccent(item.domain);
                return (
                  <tr
                    key={item.caseId}
                    data-testid={`workspace-case-${item.caseId}`}
                    className="group transition-colors hover:bg-[#F8FAFC]"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn("size-2 shrink-0 rounded-full", accent.dot)}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-[#0B1F3A] group-hover:text-[#0B5CFF]">
                            {item.title}
                          </p>
                          <p className="truncate text-[11px] text-[#8A939D]">
                            {item.domainLabel} · {item.lastActivityLabel}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-medium",
                          accent.badge,
                        )}
                      >
                        {item.domainLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          statusTone(item.status),
                        )}
                      >
                        {item.statusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-[#8A939D]">
                      {formatRelativeMn(item.lastActivityAt, now)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/lawyer/workspace/case-review?caseId=${encodeURIComponent(item.caseId)}`}
                        className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-[12px] font-medium text-[#0B5CFF] hover:bg-[#E8F0FE]"
                      >
                        Нээх
                        <ChevronRight className="size-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 font-medium transition-colors",
        active ? "bg-white text-[#0B1F3A] shadow-xs" : "text-[#8A939D] hover:text-[#0B1F3A]",
      )}
    >
      {children}
    </button>
  );
}
