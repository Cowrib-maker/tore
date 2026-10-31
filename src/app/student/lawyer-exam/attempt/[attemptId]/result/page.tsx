import { notFound, redirect } from "next/navigation";

import { getResultForSession } from "@/application/actions/student-exam.actions";
import { requirePageSession } from "@/application/common/session";
import { ResultView } from "@/components/student/exam/result-view";
import { StudentShell, studentSidebarItems } from "@/components/student/student-shell";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";
import { getLawyerExamCopy } from "@/i18n/lawyer-exam";

export default async function LawyerExamResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  await requirePageSession();
  const locale = await getLocale();
  const [{ attemptId }, dict] = await Promise.all([params, getDictionary(locale)]);
  const copy = getLawyerExamCopy(locale);

  const loaded = await getResultForSession(attemptId);
  if (!loaded.ok) {
    if (loaded.error === "not_found") notFound();
    // Still in progress: the key is not released; continue the attempt instead.
    if (loaded.error === "in_progress") redirect(`/student/lawyer-exam/attempt/${attemptId}`);
  }

  return (
    <StudentShell
      brand={dict.common.brand}
      backHref="/student/lawyer-exam"
      backLabel={copy.result.toHub}
      sidebar={studentSidebarItems("lawyer-exam")}
    >
      <h1 className="mb-5 font-[family-name:var(--font-landing-display)] text-[1.85rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.2rem]">
        {copy.result.title}
      </h1>
      {loaded.ok ? (
        <ResultView result={loaded.result} copy={copy} />
      ) : (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {copy.errors[loaded.error as keyof typeof copy.errors] ?? copy.genericError}
        </p>
      )}
    </StudentShell>
  );
}
