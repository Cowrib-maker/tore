import { getExamHubForSession } from "@/application/actions/student-exam.actions";
import { requirePageSession } from "@/application/common/session";
import { StartExamForm } from "@/components/student/exam/start-exam-form";
import { StudentShell, studentSidebarItems } from "@/components/student/student-shell";
import { EXAM_AREAS } from "@/domain/student/exam/types";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";
import { getLawyerExamCopy } from "@/i18n/lawyer-exam";

export default async function NewLawyerExamPage() {
  await requirePageSession();
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const copy = getLawyerExamCopy(locale);
  const hub = await getExamHubForSession();
  const total = hub.ok ? EXAM_AREAS.reduce((s, a) => s + hub.hub.counts[a], 0) : 0;

  return (
    <StudentShell
      brand={dict.common.brand}
      backHref="/student/lawyer-exam"
      backLabel={copy.browse.back}
      sidebar={studentSidebarItems("lawyer-exam")}
    >
      <h1 className="font-[family-name:var(--font-landing-display)] text-[1.85rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.2rem]">
        {copy.exam.newTitle}
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#5C6570]">{copy.exam.newIntro}</p>
      <div className="mt-6 max-w-2xl">
        {!hub.ok ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {copy.errors[hub.error as keyof typeof copy.errors] ?? copy.genericError}
          </p>
        ) : total === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#0B1F3A]/20 bg-white p-6">
            <h2 className="text-[16px] font-bold text-[#0B1F3A]">{copy.bankEmptyTitle}</h2>
            <p className="mt-1 text-[14px] text-[#5C6570]">{copy.bankEmptyBody}</p>
          </div>
        ) : (
          <StartExamForm counts={hub.hub.counts} copy={copy} />
        )}
      </div>
    </StudentShell>
  );
}
