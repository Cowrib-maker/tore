import Link from "next/link";
import {
  ChevronRight,
  FileText,
  FolderOpen,
  MessageSquare,
} from "lucide-react";

import type { LawyerWorkspaceHomeView } from "@/application/use-cases/case-review";
import { cn } from "@/lib/utils";

function formatStamp(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 16).replace("T", " ");
}

function splitActivity(label: string): { title: string; detail: string | null } {
  const separator = " · ";
  const index = label.indexOf(separator);
  if (index === -1) return { title: label, detail: null };
  return {
    detail: label.slice(0, index),
    title: label.slice(index + separator.length),
  };
}

type Props = {
  view: LawyerWorkspaceHomeView;
};

export function LawyerWorkspaceHome({ view }: Props) {
  const { cases, recentConversations, activity, summary } = view;
  const visibleCases = cases.slice(0, 8);

  return (
    <div className="space-y-7" data-testid="lawyer-workspace-home">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight text-[#0B1F3A]">
            Ажлын талбар
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-[#5C6570]">
            Хэргүүд, AI яриа болон баримт бичгээ нэг дороос удирдана.
          </p>
        </div>
        <Link
          href="/lawyer/workspace/cases#create-case"
          className="hidden h-10 items-center rounded-lg bg-[#0F3D33] px-4 text-sm font-medium text-white shadow-[0_8px_20px_-12px_rgba(15,61,51,0.9)] hover:bg-[#145244] lg:inline-flex"
        >
          + Шинэ хэрэг
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Нээлттэй хэрэг"
          value={summary.caseCount}
          hint={
            summary.notAnalyzedCaseCount > 0
              ? `${summary.notAnalyzedCaseCount} хэрэг шинжлээгүй`
              : summary.analyzedCaseCount > 0
                ? `${summary.analyzedCaseCount} хэрэг шинжилсэн`
                : "Одоогоор хэрэг алга"
          }
          icon={FolderOpen}
        />
        <MetricCard
          label="AI яриа"
          value={summary.conversationCount}
          hint={`Сүүлийн 7 хоногт ${summary.conversationsLast7Days} яриа`}
          icon={MessageSquare}
        />
        <MetricCard
          label="Баримт бичиг"
          value={summary.documentCount}
          hint={
            summary.documentCount > 0
              ? `${summary.documentCount} файл нийт`
              : "Хавсаргасан баримт алга"
          }
          icon={FileText}
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold tracking-[0.08em] text-[#0B1F3A] uppercase">
            Миний хэргүүд
          </h2>
          <Link
            href="/lawyer/workspace/cases"
            className="text-sm font-medium text-[#0F3D33] hover:underline"
          >
            Бүгдийг харах →
          </Link>
        </div>

        {cases.length === 0 ? (
          <div
            data-testid="workspace-empty-cases"
            className="rounded-xl border border-dashed border-[#0B1F3A]/12 bg-white px-6 py-12 text-center"
          >
            <p className="font-semibold text-[#0B1F3A]">Одоогоор хэрэг алга.</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#5C6570]">
              Шинэ хэрэг үүсгээд ажлаа эндээс эхлүүлээрэй.
            </p>
            <Link
              href="/lawyer/workspace/cases#create-case"
              className="mt-5 inline-flex h-10 items-center rounded-lg bg-[#0F3D33] px-4 text-sm font-medium text-white"
            >
              Шинэ хэрэг үүсгэх
            </Link>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {visibleCases.map((item) => (
              <li key={item.caseId}>
                <article
                  data-testid={`workspace-case-${item.caseId}`}
                  className="rounded-xl border border-[#0B1F3A]/8 bg-white px-4 py-3.5 shadow-[0_10px_24px_-20px_rgba(11,31,58,0.45)] transition hover:border-[#0F3D33]/20"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF4F0] text-[#0F3D33]">
                        <FolderOpen className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold text-[#0B1F3A]">
                          {item.title}
                        </h3>
                        <p className="mt-0.5 text-sm text-[#5C6570]">
                          {item.domainLabel}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
                      <StatusPill label={item.statusLabel} status={item.status} />
                      <span className="flex items-center gap-1.5 text-xs text-[#5C6570]">
                        <MessageSquare className="size-3.5" />
                        {item.conversationCount}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-[#5C6570]">
                        <FileText className="size-3.5" />
                        {item.documentCount}
                      </span>
                      <span className="text-xs text-[#8A939D]">
                        {formatStamp(item.lastActivityAt)}
                      </span>
                      <Link
                        href={`/lawyer/workspace/case-review?caseId=${encodeURIComponent(item.caseId)}`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-[#0F3D33] hover:bg-[#EAF4F0]"
                      >
                        Нээх
                        <ChevronRight className="size-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-[#0B1F3A]/8 bg-white p-5 shadow-[0_10px_24px_-20px_rgba(11,31,58,0.45)]">
          <h2 className="text-[13px] font-semibold tracking-[0.08em] text-[#0B1F3A] uppercase">
            Сүүлийн AI ярианууд
          </h2>
          {recentConversations.length === 0 ? (
            <p className="mt-4 text-sm text-[#5C6570]">
              Одоогоор хадгалагдсан яриа байхгүй.
            </p>
          ) : (
            <ul className="mt-2" data-testid="workspace-recent-ai">
              {recentConversations.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/legal-ai?conversationId=${encodeURIComponent(item.id)}`}
                    className="flex items-center gap-3 py-3"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF4F0] text-[#0F3D33]">
                      <MessageSquare className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#0B1F3A]">
                        {item.title}
                      </span>
                      {item.caseTitle ? (
                        <span className="mt-0.5 block truncate text-xs text-[#5C6570]">
                          {item.caseTitle}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-[#8A939D]">
                      {formatStamp(item.updatedAt)}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-[#C5CBC7]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/legal-ai"
            className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#0F3D33]/20 text-sm font-medium text-[#0F3D33] hover:bg-[#EAF4F0]"
          >
            AI чат руу очих
          </Link>
        </section>

        <section className="rounded-xl border border-[#0B1F3A]/8 bg-white p-5 shadow-[0_10px_24px_-20px_rgba(11,31,58,0.45)]">
          <h2 className="text-[13px] font-semibold tracking-[0.08em] text-[#0B1F3A] uppercase">
            Сүүлийн үйл ажиллагаа
          </h2>
          {activity.length === 0 ? (
            <p className="mt-4 text-sm text-[#5C6570]">Үйл ажиллагаа алга.</p>
          ) : (
            <ol className="mt-4 space-y-4" data-testid="workspace-activity">
              {activity.map((item) => {
                const parsed = splitActivity(item.label);
                return (
                  <li key={item.id} className="flex items-start gap-3">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#0F3D33]" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0B1F3A]">
                        {parsed.title}
                      </p>
                      {parsed.detail ? (
                        <p className="mt-0.5 truncate text-xs text-[#5C6570]">
                          {parsed.detail}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-[#8A939D]">
                        {formatStamp(item.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof FolderOpen;
}) {
  return (
    <div className="rounded-xl border border-[#0B1F3A]/8 bg-white px-4 py-4 shadow-[0_10px_24px_-20px_rgba(11,31,58,0.45)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.08em] text-[#8A939D] uppercase">
            {label}
          </p>
          <p className="mt-2 text-[1.75rem] font-semibold leading-none text-[#0B1F3A]">
            {value}
          </p>
          <p className="mt-2 text-xs text-[#5C6570]">{hint}</p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-lg bg-[#EAF4F0] text-[#0F3D33]">
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}

function StatusPill({ label, status }: { label: string; status: string }) {
  const analyzed = status !== "NOT_ANALYZED" && status !== "ANALYSIS_FAILED";
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium",
        status === "ANALYSIS_FAILED"
          ? "bg-red-50 text-red-700"
          : analyzed
            ? "bg-[#EAF4F0] text-[#0F3D33]"
            : "bg-[#F8F1E6] text-[#8A5A12]",
      )}
    >
      {label}
    </span>
  );
}
