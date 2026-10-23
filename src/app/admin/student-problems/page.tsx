import Link from "next/link";

import { listProblemsForReviewAction } from "@/application/actions/student-exam.actions";
import { ProblemReviewRow } from "@/components/student/exam/problem-review-row";
import { REVIEW_STATUSES, parseExamArea, type ReviewStatus } from "@/domain/student/exam/types";
import { getLocale } from "@/i18n/get-locale";
import { getLawyerExamCopy } from "@/i18n/lawyer-exam";

export default async function AdminStudentProblemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const params = await searchParams;
  const copy = getLawyerExamCopy(locale);
  const wanted = typeof params.status === "string" && (REVIEW_STATUSES as readonly string[]).includes(params.status) ? (params.status as ReviewStatus) : undefined;
  const area = parseExamArea(typeof params.area === "string" ? params.area : null);

  const result = await listProblemsForReviewAction(wanted ? [wanted] : undefined);
  const items = result.ok ? result.items.filter((i) => !area || i.area === area) : [];

  const chip = (active: boolean) =>
    `inline-flex h-9 items-center rounded-full border px-3 text-[13px] font-semibold ${active ? "border-[#0B1F3A] bg-[#0B1F3A] text-white" : "border-[#0B1F3A]/15 bg-white text-[#0B1F3A]"}`;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-[#0B1F3A]">{copy.admin.title}</h1>
      <p className="mt-2 text-[14px] leading-6 text-[#5C6570]">{copy.admin.intro}</p>
      <nav aria-label={copy.admin.status} className="mt-4 flex flex-wrap gap-2">
        <Link href="/admin/student-problems" className={chip(!wanted)}>
          {copy.admin.filterAll}
        </Link>
        {REVIEW_STATUSES.map((s) => (
          <Link key={s} href={`/admin/student-problems?status=${s}`} className={chip(wanted === s)}>
            {copy.admin.statuses[s]}
          </Link>
        ))}
      </nav>
      {!result.ok ? (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {copy.errors.forbidden}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-[14px] text-[#5C6570]">{copy.admin.empty}</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {items.map((item) => (
            <ProblemReviewRow key={item.id} item={item} copy={copy} />
          ))}
        </ul>
      )}
    </div>
  );
}
