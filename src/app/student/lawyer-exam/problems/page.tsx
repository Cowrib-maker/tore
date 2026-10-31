import Link from "next/link";

import { browseProblemsForSession, listCourtDecisionsForSession } from "@/application/actions/student-exam.actions";
import { requirePageSession } from "@/application/common/session";
import { StudentShell, studentSidebarItems } from "@/components/student/student-shell";
import { EXAM_AREAS, parseExamArea } from "@/domain/student/exam/types";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";
import { fmt, getLawyerExamCopy } from "@/i18n/lawyer-exam";

const chip = (active: boolean) =>
  `inline-flex h-9 items-center rounded-full border px-3 text-[13px] font-semibold transition ${
    active ? "border-[#0B1F3A] bg-[#0B1F3A] text-white" : "border-[#0B1F3A]/15 bg-white text-[#0B1F3A] hover:bg-[#F7F6F2]"
  }`;

export default async function LawyerExamProblemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageSession();
  const locale = await getLocale();
  const [dict, params] = await Promise.all([getDictionary(locale), searchParams]);
  const copy = getLawyerExamCopy(locale);
  const area = parseExamArea(typeof params.area === "string" ? params.area : null);
  const topic = typeof params.topic === "string" && params.topic ? params.topic : undefined;

  const result = await browseProblemsForSession({ area: area ?? undefined, topic });
  const items = result.ok ? result.items : [];

  // Topics available in the unfiltered list (so the topic chips do not vanish when one is selected).
  const all = result.ok ? (area || topic ? await browseProblemsForSession({}) : result) : null;
  const topics = all && all.ok ? [...new Set(all.items.map((i) => i.problem.topic).filter((t): t is string => Boolean(t)))].sort() : [];

  const href = (next: { area?: string; topic?: string }) => {
    const q = new URLSearchParams();
    if (next.area) q.set("area", next.area);
    if (next.topic) q.set("topic", next.topic);
    const s = q.toString();
    return `/student/lawyer-exam/problems${s ? `?${s}` : ""}`;
  };

  return (
    <StudentShell
      brand={dict.common.brand}
      backHref="/student/lawyer-exam"
      backLabel={copy.browse.back}
      sidebar={studentSidebarItems("lawyer-exam")}
    >
      <h1 className="font-[family-name:var(--font-landing-display)] text-[1.85rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.2rem]">
        {copy.browse.title}
      </h1>

      <nav aria-label={copy.browse.title} className="mt-5 flex flex-wrap gap-2">
        <Link href={href({ topic })} className={chip(!area)}>
          {copy.browse.allAreas}
        </Link>
        {EXAM_AREAS.map((a) => (
          <Link key={a} href={href({ area: a, topic })} className={chip(area === a)}>
            {copy.areas[a]}
          </Link>
        ))}
      </nav>
      {topics.length > 0 ? (
        <nav aria-label={copy.browse.allTopics} className="mt-2 flex flex-wrap gap-2">
          <Link href={href({ area: area ?? undefined })} className={chip(!topic)}>
            {copy.browse.allTopics}
          </Link>
          {topics.map((t) => (
            <Link key={t} href={href({ area: area ?? undefined, topic: t })} className={chip(topic === t)}>
              {t}
            </Link>
          ))}
        </nav>
      ) : null}

      {!result.ok ? (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {copy.errors[result.error as keyof typeof copy.errors] ?? copy.genericError}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-[14px] text-[#5C6570]">{copy.browse.noResults}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map(({ problem, studied, inProgress }) => (
            <li key={problem.id}>
              <Link
                href={`/student/lawyer-exam/problems/${problem.id}`}
                className="block rounded-2xl border border-[#0B1F3A]/10 bg-white px-5 py-4 transition hover:border-[#0B5CFF]/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#0B5CFF]">
                    {copy.areas[problem.area]} · {problem.ordinalLabel}
                  </span>
                  {studied ? <span className="rounded-full bg-[#E8F4F1] px-2 py-0.5 text-[11px] font-semibold text-[#1A7A72]">{copy.browse.studied}</span> : null}
                  {inProgress ? <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[11px] font-semibold text-[#0B5CFF]">{copy.browse.inProgress}</span> : null}
                  {problem.reviewStatus !== "APPROVED" ? (
                    <span className="rounded-full bg-[#F7F6F2] px-2 py-0.5 text-[11px] font-semibold text-[#5C6570]">{copy.badges.notReviewed}</span>
                  ) : null}
                </div>
                <p className="mt-2 line-clamp-3 text-[14px] leading-6 text-[#1B2733]">{problem.statement}</p>
                <p className="mt-2 text-[12px] text-[#8A939D]">{problem.topic ?? copy.browse.unclassified}</p>
                <span className="mt-2 inline-flex text-[13px] font-semibold text-[#0B1F3A]">{copy.browse.open}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CourtDecisionIndex copy={copy} />
    </StudentShell>
  );
}

async function CourtDecisionIndex({ copy }: { copy: ReturnType<typeof getLawyerExamCopy> }) {
  const result = await listCourtDecisionsForSession();
  const items = result.ok ? result.items : [];
  const chapters = [...new Set(items.map((d) => d.chapter))].sort((a, b) => (a ?? 0) - (b ?? 0));
  return (
    <details className="mt-10 rounded-2xl border border-[#0B1F3A]/10 bg-white p-4">
      <summary className="cursor-pointer text-[14px] font-semibold text-[#0B1F3A]">{copy.browse.courtTitle}</summary>
      <p className="mt-2 text-[12px] leading-5 text-[#8A939D]">{copy.browse.courtIntro}</p>
      {items.length === 0 ? (
        <p className="mt-3 text-[13px] text-[#5C6570]">{copy.browse.courtEmpty}</p>
      ) : (
        chapters.map((chapter) => (
          <section key={chapter ?? "x"} className="mt-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#0B5CFF]">
              {chapter !== null ? fmt(copy.browse.courtChapter, { n: chapter }) : "—"}
            </h3>
            <ul className="mt-2 space-y-2">
              {items
                .filter((d) => d.chapter === chapter)
                .map((d) => (
                  <li key={d.id} className="text-[13px] leading-6 text-[#1B2733]">
                    <span className="font-semibold">{d.courtDate ?? "—"}</span> · {d.caseNumber ?? "—"} — {d.topic}{" "}
                    <span className="text-[#8A939D]">
                      ({fmt(copy.browse.courtPages, { from: d.pageFrom ?? "?", to: d.pageTo ?? "?" })}; {d.sourceFile})
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </details>
  );
}
