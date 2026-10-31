import { notFound, redirect } from "next/navigation";

import { getRunnerViewForSession } from "@/application/actions/student-exam.actions";
import { requirePageSession } from "@/application/common/session";
import { ExamRunner } from "@/components/student/exam/exam-runner";
import { StudentShell, studentSidebarItems } from "@/components/student/student-shell";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";
import { getLawyerExamCopy } from "@/i18n/lawyer-exam";

export default async function LawyerExamAttemptPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageSession();
  const locale = await getLocale();
  const [{ attemptId }, query, dict] = await Promise.all([params, searchParams, getDictionary(locale)]);
  const copy = getLawyerExamCopy(locale);

  const loaded = await getRunnerViewForSession(attemptId);
  if (!loaded.ok) {
    if (loaded.error === "not_found") notFound();
    return (
      <StudentShell brand={dict.common.brand} backHref="/student/lawyer-exam" backLabel={copy.browse.back} sidebar={studentSidebarItems("lawyer-exam")}>
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {copy.errors[loaded.error as keyof typeof copy.errors] ?? copy.genericError}
        </p>
      </StudentShell>
    );
  }
  // Finished (submitted, or expired by the server): the answers are locked, so go straight to the result.
  if ("closed" in loaded) redirect(`/student/lawyer-exam/attempt/${loaded.attemptId}/result`);

  return (
    <StudentShell
      brand={dict.common.brand}
      backHref="/student/lawyer-exam"
      backLabel={copy.browse.back}
      sidebar={studentSidebarItems("lawyer-exam")}
    >
      {query.resumed === "1" ? (
        <p role="status" className="mx-auto mb-4 max-w-3xl rounded-lg bg-[#E8F4F1] px-3 py-2 text-[13px] text-[#1A7A72]">
          {copy.exam.resumed}
        </p>
      ) : null}
      <ExamRunner view={loaded.view} copy={copy} />
    </StudentShell>
  );
}
