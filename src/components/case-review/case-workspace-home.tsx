"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

import { startCaseChatAction } from "@/application/actions/case-review.actions";
import type {
  CaseActivityItem,
  CaseConversationSummary,
  CaseDocumentView,
} from "@/application/use-cases/case-review";
import {
  analysisStatusLabelMn,
  legalDomainLabelMn,
} from "@/application/use-cases/case-review/labels";
import { CasePdfUpload } from "@/components/case-review/case-pdf-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CaseReviewWorkspacePayload } from "@/engine/doctrine";
import { cn } from "@/lib/utils";

function formatStamp(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 19).replace("T", " ");
}

type Props = {
  payload: CaseReviewWorkspacePayload;
  createdAt: string;
  conversations: CaseConversationSummary[];
  documents: CaseDocumentView[];
  activity: CaseActivityItem[];
  titleAction: (payload: FormData) => void;
  titlePending: boolean;
  titleError?: string;
  titleSuccess?: boolean;
};

export function CaseWorkspaceHome({
  payload,
  createdAt,
  conversations,
  documents,
  activity,
  titleAction,
  titlePending,
  titleError,
  titleSuccess,
}: Props) {
  const [isEditing, setEditing] = useState(false);
  const editing = isEditing && !titleSuccess;
  const title = payload.title;
  const version = payload.version;

  const pdfs = documents.length
    ? documents
    : payload.caseEvidence
        .filter((item) => item.fileReference)
        .map((item) => ({
          id: item.id,
          fileName: item.title,
          description: item.description,
          createdAt: item.createdAt,
          href: "#",
        }));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#0B1F3A]/8 bg-white px-6 py-6 shadow-[0_10px_30px_-24px_rgba(11,31,58,0.45)]">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#C8A45D] uppercase">
          Хэрэг
        </p>
        {editing ? (
          <form action={titleAction} className="mt-3 space-y-3">
            <input type="hidden" name="caseId" value={payload.caseId} />
            <input type="hidden" name="expectedVersion" value={String(version)} />
            <Input
              name="title"
              required
              defaultValue={title}
              aria-label="Хэргийн нэр"
              className="h-11 text-lg font-semibold"
            />
            {titleError ? (
              <p role="alert" className="text-sm text-destructive">
                {titleError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={titlePending}>
                Хадгалах
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                Цуцлах
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[#0A0F14] sm:text-[1.75rem]">
              {title}
            </h1>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Засах
            </Button>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2" data-testid="case-workspace-actions">
          <form action={startCaseChatAction}>
            <input type="hidden" name="caseId" value={payload.caseId} />
            <Button
              type="submit"
              className="h-10 bg-[#0B1F3A] px-4 text-white hover:bg-[#0B1F3A]/90"
            >
              AI-тай ярилцах
            </Button>
          </form>
          <a
            href="#case-analysis"
            className={cn(
              "inline-flex h-10 items-center rounded-lg border border-[#0B1F3A]/14 bg-white px-4 text-sm font-medium text-[#0B1F3A]",
            )}
          >
            Хэрэг шинжлэх
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard label="Салбар" value={legalDomainLabelMn(payload.domain)} />
        <OverviewCard
          label="Шинжилгээ"
          value={analysisStatusLabelMn(payload.status)}
        />
        <OverviewCard label="AI яриа" value={String(conversations.length)} />
        <OverviewCard label="Баримт" value={String(pdfs.length)} />
      </div>

      <section className="rounded-2xl border border-[#0B1F3A]/8 bg-white p-5">
        <h2 className="text-sm font-semibold tracking-wide text-[#0A0F14] uppercase">
          AI ярианууд
        </h2>
        {conversations.length === 0 ? (
          <p className="mt-3 text-sm text-[#5C6570]">
            Энэ хэрэгт хадгалагдсан яриа байхгүй. «AI-тай ярилцах» дарж эхлүүлнэ үү.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[#0B1F3A]/8" data-testid="case-ai-history">
            {conversations.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/legal-ai?conversationId=${encodeURIComponent(item.id)}&caseId=${encodeURIComponent(payload.caseId)}`}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium text-[#0A0F14]">{item.title}</span>
                  <span className="text-xs text-[#5C6570]">
                    Шинэчилсэн {formatStamp(item.updatedAt)} · Үүссэн{" "}
                    {formatStamp(item.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="case-documents"
        className="rounded-2xl border border-[#0B1F3A]/8 bg-white p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-[#0A0F14] uppercase">
            Баримт бичиг
          </h2>
          <CasePdfUpload
            caseId={payload.caseId}
            expectedVersion={version}
          />
        </div>
        {pdfs.length === 0 ? (
          <p className="mt-3 text-sm text-[#5C6570]">
            Энэ хэрэгт PDF хавсаргаагүй байна.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[#0B1F3A]/8" data-testid="case-document-list">
            {pdfs.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                {item.href && item.href !== "#" ? (
                  <a
                    href={item.href}
                    className="font-medium text-[#0A0F14] underline-offset-4 hover:underline"
                  >
                    {item.fileName}
                  </a>
                ) : (
                  <span className="font-medium text-[#0A0F14]">{item.fileName}</span>
                )}
                <span className="text-xs text-[#5C6570]">
                  {item.description ? `${item.description} · ` : ""}
                  {formatStamp(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[#0B1F3A]/8 bg-white p-5">
        <h2 className="text-sm font-semibold tracking-wide text-[#0A0F14] uppercase">
          Хэрэг шинжлэлийн төлөв
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-[#F4F8F6] px-2.5 py-1 text-xs font-medium text-[#0F3D33]">
            {analysisStatusLabelMn(payload.status)}
          </span>
          <span className="text-sm text-[#5C6570]">
            Сүүлд шинжилсэн: {formatStamp(payload.analyzedAt)}
          </span>
        </div>
        {payload.lastAnalysisError ? (
          <p className="mt-2 text-sm text-destructive">{payload.lastAnalysisError}</p>
        ) : null}
        <a
          href="#case-analysis"
          className="mt-3 inline-flex text-sm font-medium text-[#0B1F3A] underline-offset-4 hover:underline"
        >
          Хэрэг шинжлэх хэсэг рүү очих
        </a>
      </section>

      <section className="rounded-2xl border border-[#0B1F3A]/8 bg-white p-5">
        <h2 className="text-sm font-semibold tracking-wide text-[#0A0F14] uppercase">
          Сүүлийн үйл ажиллагаа
        </h2>
        {activity.length === 0 ? (
          <p className="mt-3 text-sm text-[#5C6570]">Үйл ажиллагаа алга.</p>
        ) : (
          <ol className="mt-3 space-y-3" data-testid="case-activity">
            {activity.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#C8A45D]" />
                <div>
                  <p className="text-sm font-medium text-[#0A0F14]">{item.label}</p>
                  <p className="text-xs text-[#5C6570]">{formatStamp(item.at)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-[11px] text-[#8A939D]">
          Үүсгэсэн {formatStamp(createdAt)}
        </p>
      </section>
    </div>
  );
}

function OverviewCard({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#0B1F3A]/8 bg-white px-4 py-4">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[#5C6570] uppercase">
        {label}
      </p>
      <div className="mt-2 text-sm font-semibold text-[#0A0F14]">{value}</div>
    </div>
  );
}
