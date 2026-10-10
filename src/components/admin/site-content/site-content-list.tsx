"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  SITE_CONTENT_PAGES,
  SITE_CONTENT_SECTION_LABELS,
  type SiteContentPageId,
  type SiteContentSectionId,
} from "@/domain/site-content/registry";

export type LocaleState = "default" | "published" | "draft";

export type SiteContentListRow = {
  key: string;
  page: SiteContentPageId;
  section: SiteContentSectionId;
  labelMn: string;
  labelEn: string;
  preview: string;
  mn: LocaleState;
  en: LocaleState;
};

const STATE_LABEL: Record<LocaleState, string> = {
  default: "Анхдагч",
  published: "Нийтлэгдсэн",
  draft: "Ноорогтой",
};

type StatusFilter = "all" | "draft" | "published" | "default";

function StateBadge({ locale, state }: { locale: string; state: LocaleState }) {
  return (
    <Badge variant={state === "draft" ? "destructive" : state === "published" ? "default" : "outline"}>
      {locale.toUpperCase()} · {STATE_LABEL[state]}
    </Badge>
  );
}

export function SiteContentList({ rows }: { rows: SiteContentListRow[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<"all" | SiteContentPageId>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const pagesPresent = useMemo(() => SITE_CONTENT_PAGES.filter((p) => rows.some((r) => r.page === p.id)), [rows]);

  const tree = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (page !== "all" && row.page !== page) return false;
      if (status !== "all" && row.mn !== status && row.en !== status) return false;
      return !q || [row.key, row.labelMn, row.labelEn, row.preview].some((text) => text.toLowerCase().includes(q));
    });
    return pagesPresent
      .map((p) => {
        const pageRows = filtered.filter((r) => r.page === p.id);
        const sections = [...new Set(pageRows.map((r) => r.section))].map((section) => ({ section, items: pageRows.filter((r) => r.section === section) }));
        return { page: p, count: pageRows.length, sections };
      })
      .filter((entry) => entry.count > 0);
  }, [rows, query, page, status, pagesPresent]);

  const total = tree.reduce((n, entry) => n + entry.count, 0);
  const drafts = rows.filter((r) => r.mn === "draft" || r.en === "draft").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
        <Input className="sm:col-span-2 xl:col-span-1" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Хайх: түлхүүр, нэр, текст…" aria-label="Агуулга хайх" />
        <select aria-label="Хуудас" className="rounded-md border bg-background px-2 text-sm" value={page} onChange={(e) => setPage(e.target.value as "all" | SiteContentPageId)}>
          <option value="all">Бүх хуудас</option>
          {pagesPresent.map((p) => (
            <option key={p.id} value={p.id}>{p.title.mn}</option>
          ))}
        </select>
        <select aria-label="Төлөв" className="rounded-md border bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="all">Бүх төлөв</option>
          <option value="draft">Ноорогтой ({drafts})</option>
          <option value="published">Нийтлэгдсэн</option>
          <option value="default">Анхдагч</option>
        </select>
      </div>
      <p className="text-sm text-muted-foreground" role="status">{total} агуулга харагдаж байна · {drafts} нийтлээгүй ноорогтой</p>
      {tree.length === 0 ? <p className="text-sm text-muted-foreground">Тохирох агуулга олдсонгүй.</p> : null}
      {tree.map(({ page: p, sections }) => (
        <section key={p.id} aria-labelledby={`page-${p.id}`} className="space-y-3">
          <h2 id={`page-${p.id}`} className="text-base font-semibold">
            {p.title.mn} <span className="font-normal text-muted-foreground">/ {p.title.en}</span>{" "}
            <code className="text-xs font-normal text-muted-foreground">{p.route}</code>
          </h2>
          {sections.map(({ section, items }) => (
            <div key={section} className="space-y-1">
              <h3 className="text-sm font-medium text-muted-foreground">{SITE_CONTENT_SECTION_LABELS[section].mn} <span className="font-normal">/ {SITE_CONTENT_SECTION_LABELS[section].en}</span></h3>
              <ul className="divide-y rounded-lg border">
                {items.map((row) => (
                  <li key={row.key}>
                    <Link href={`/admin/content/${encodeURIComponent(row.key)}`} className="flex flex-col gap-1 p-3 hover:bg-muted/50">
                      <span className="font-medium">
                        {row.labelMn} <span className="font-normal text-muted-foreground">· {row.labelEn}</span>
                      </span>
                      <span className="line-clamp-2 break-words text-sm text-muted-foreground">{row.preview}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <code className="text-xs text-muted-foreground">{row.key}</code>
                        <StateBadge locale="mn" state={row.mn} />
                        <StateBadge locale="en" state={row.en} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
