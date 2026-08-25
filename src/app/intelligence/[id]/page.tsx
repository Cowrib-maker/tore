import Link from "next/link";
import { notFound } from "next/navigation";

import { getLegalIntelligenceRecord } from "@/application/use-cases/legal-intelligence/load-feed";
import { BRAND_LOGO_LANDING } from "@/components/brand/tokens";
import { BrandLink } from "@/components/layout/brand-link";
import {
  CATEGORY_TO_SECTION,
  type LegalIntelligenceStatus,
} from "@/domain/legal-intelligence";
import { getDictionary } from "@/i18n/get-dictionary";
import type { Dictionary } from "@/i18n/types";
import { legalIntelligenceAdapters } from "@/infrastructure/legal-intelligence";

type Params = Promise<{ id: string }>;

export default async function IntelligenceDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const [dict, record] = await Promise.all([
    getDictionary(),
    getLegalIntelligenceRecord(id, legalIntelligenceAdapters),
  ]);

  if (!record) notFound();

  const home = dict.publicHome;
  const section = CATEGORY_TO_SECTION[record.category];
  const categoryLabel = home.intelligenceSections[section];
  const statusLabel = statusLabelFor(home, record.status);

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#0A0F14]">
      <header className="border-b border-[#0B1F3A]/8 bg-[#F7F6F2]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_LANDING} />
          <Link
            href="/#intelligence"
            className="text-[13px] font-medium text-[#5C6570] transition hover:text-[#0B1F3A]"
          >
            {home.intelligenceBack}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#E8F4F1] px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-[#1A7A72]">
            {categoryLabel}
          </span>
          <span className="rounded-full border border-[#0B1F3A]/12 px-2.5 py-0.5 text-[11px] font-medium text-[#5C6570]">
            {statusLabel}
          </span>
        </div>

        <h1 className="mt-4 font-[family-name:var(--font-landing-display)] text-[1.75rem] leading-tight tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.1rem]">
          {record.title}
        </h1>

        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <MetaRow
            label={home.intelligencePublished}
            value={record.publishedAt ?? home.intelligenceDateUnknown}
          />
          <MetaRow
            label={home.intelligenceEffective}
            value={record.effectiveAt ?? home.intelligenceDateUnknown}
          />
        </dl>

        {record.summary ? (
          <section className="mt-8 rounded-2xl border border-[#0B1F3A]/10 bg-white p-5 sm:p-6">
            <h2 className="text-[12px] font-semibold tracking-[0.14em] text-[#1A7A72] uppercase">
              {home.intelligenceSourceExcerpt}
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-[#3D4A57]">
              {record.summary}
            </p>
            <p className="mt-3 text-[12px] text-[#8A939D]">
              {home.intelligenceSourceExcerptNote}
            </p>
          </section>
        ) : null}

        <section className="mt-6 rounded-2xl border border-[#0B1F3A]/10 bg-white p-5 sm:p-6">
          <h2 className="text-[12px] font-semibold tracking-[0.14em] text-[#1A7A72] uppercase">
            {home.intelligenceOfficialSource}
          </h2>
          <p className="mt-3 text-[14px] text-[#3D4A57]">{record.sourceName}</p>
          {record.sourceReference ? (
            <p className="mt-1 text-[12px] text-[#8A939D]">
              {record.sourceReference}
            </p>
          ) : null}
          <a
            href={record.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex text-[14px] font-semibold text-[#0B1F3A] underline-offset-4 hover:underline"
          >
            {home.intelligenceOpenSource}
          </a>
        </section>
      </main>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#0B1F3A]/8 bg-white px-4 py-3">
      <dt className="text-[11px] font-semibold tracking-[0.12em] text-[#8A939D] uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[14px] font-medium text-[#0B1F3A]">{value}</dd>
    </div>
  );
}

function statusLabelFor(
  home: Dictionary["publicHome"],
  status: LegalIntelligenceStatus,
): string {
  return home.intelligenceStatuses[status] ?? home.intelligenceStatuses.UNKNOWN;
}
