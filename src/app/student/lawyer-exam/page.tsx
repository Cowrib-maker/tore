import Link from "next/link";

import { getExamHubForSession } from "@/application/actions/student-exam.actions";
import { getSessionUser } from "@/application/common/session";
import { StudentShell, studentSidebarItems } from "@/components/student/student-shell";
import { UserRole } from "@/domain/enums";
import { EXAM_AREAS } from "@/domain/student/exam/types";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";
import { fmt, getLawyerExamCopy } from "@/i18n/lawyer-exam";

const pillPrimary =
  "inline-flex h-11 items-center justify-center rounded-full bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#16365F]";
const pillSecondary =
  "inline-flex h-11 items-center justify-center rounded-full border border-[#0B1F3A]/15 bg-white px-5 text-[13px] font-semibold text-[#0B1F3A] transition hover:bg-[#EEF4F2]";

export default async function LawyerExamHubPage() {
  const locale = await getLocale();
  const [dict, session] = await Promise.all([getDictionary(locale), getSessionUser()]);
  const copy = getLawyerExamCopy(locale);
  const hubResult = session?.user?.id ? await getExamHubForSession() : null;
  const hub = hubResult && hubResult.ok ? hubResult.hub : null;
  const total = hub ? EXAM_AREAS.reduce((s, a) => s + hub.counts[a], 0) : 0;
  const isAdmin = session?.user?.role === UserRole.ADMIN;

  return (
    <StudentShell
      brand={dict.common.brand}
      backHref="/student"
      backLabel={dict.publicHome.studentPage.backHome}
      sidebar={studentSidebarItems("lawyer-exam")}
    >
      <p className="text-[12px] font-semibold tracking-[0.16em] text-[#0B5CFF] uppercase">TORE STUDENT</p>
      <h1 className="mt-3 font-[family-name:var(--font-landing-display)] text-[1.85rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.2rem]">
        {copy.title}
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#5C6570]">{copy.intro}</p>

      {!session?.user?.id ? (
        <div className="mt-8 rounded-2xl border border-[#0B1F3A]/10 bg-white p-5">
          <p className="text-[14px] text-[#1B2733]">{copy.signInRequired}</p>
          <Link href="/login" className={`${pillPrimary} mt-4`}>
            {copy.signIn}
          </Link>
        </div>
      ) : !hub ? (
        <p role="alert" className="mt-8 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {copy.genericError}
        </p>
      ) : (
        <>
          {total === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-[#0B1F3A]/20 bg-white p-6">
              <h2 className="text-[16px] font-bold text-[#0B1F3A]">{copy.bankEmptyTitle}</h2>
              <p className="mt-1 text-[14px] leading-6 text-[#5C6570]">{copy.bankEmptyBody}</p>
            </div>
          ) : (
            <>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {EXAM_AREAS.map((area) => (
                  <li key={area}>
                    <Link
                      href={`/student/lawyer-exam/problems?area=${area}`}
                      className="block rounded-2xl border border-[#0B1F3A]/10 bg-white px-5 py-4 transition hover:border-[#0B5CFF]/40"
                    >
                      <p className="text-[15px] font-semibold text-[#0B1F3A]">{copy.areas[area]}</p>
                      <p className="mt-1 text-[13px] text-[#5C6570]">{fmt(copy.problemsCount, { n: hub.counts[area] })}</p>
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/student/lawyer-exam/problems" className={pillSecondary}>
                  {copy.studyCta}
                </Link>
                {hub.activeExamId ? (
                  <Link href={`/student/lawyer-exam/attempt/${hub.activeExamId}`} className={pillPrimary}>
                    {copy.resumeExam}
                  </Link>
                ) : (
                  <Link href="/student/lawyer-exam/exam/new" className={pillPrimary}>
                    {copy.examCta}
                  </Link>
                )}
              </div>
            </>
          )}

          <section className="mt-10">
            <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#0B5CFF] uppercase">{copy.historyTitle}</h2>
            {hub.history.length === 0 ? (
              <p className="mt-3 text-[14px] text-[#5C6570]">{copy.historyEmpty}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {hub.history.map((h) => (
                  <li key={h.id}>
                    <Link
                      href={h.status === "IN_PROGRESS" ? `/student/lawyer-exam/attempt/${h.id}` : `/student/lawyer-exam/attempt/${h.id}/result`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#0B1F3A]/10 bg-white px-4 py-3 text-[14px] transition hover:border-[#0B5CFF]/40"
                    >
                      <span className="font-semibold text-[#0B1F3A]">
                        {h.mode === "EXAM" ? copy.historyExam : copy.historyStudy} · {h.problems}
                      </span>
                      <span className="text-[12px] text-[#5C6570]">{new Date(h.startedAt).toLocaleString(locale === "mn" ? "mn-MN" : locale)}</span>
                      <span className="text-[13px] font-semibold text-[#0B1F3A]">
                        {h.status === "IN_PROGRESS"
                          ? copy.historyInProgress
                          : h.percent !== null
                            ? `${h.percent}%`
                            : h.status === "EXPIRED"
                              ? `${copy.historyExpired} · ${copy.historyUnscored}`
                              : copy.historyUnscored}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isAdmin ? (
            <p className="mt-8 text-[13px]">
              <Link href="/admin/student-problems" className="font-semibold text-[#0B5CFF] underline">
                {copy.admin.title}
              </Link>
            </p>
          ) : null}
        </>
      )}
    </StudentShell>
  );
}
