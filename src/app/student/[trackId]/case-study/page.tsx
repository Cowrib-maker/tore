import { notFound } from "next/navigation";

import { StudentCaseStudyForm } from "@/components/student/student-case-study-form";
import { StudentShell } from "@/components/student/student-shell";
import { getStudentLegalProblem, parseStudentTrackId } from "@/domain/student";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function StudentCaseStudyPage({
  params,
}: {
  params: Promise<{ trackId: string }>;
}) {
  const { trackId: rawTrackId } = await params;
  const trackId = parseStudentTrackId(rawTrackId);
  if (!trackId) notFound();

  const problem = getStudentLegalProblem(trackId);
  if (!problem) notFound();

  const dict = await getDictionary();
  const student = dict.publicHome.studentPage;

  return (
    <StudentShell
      brand={dict.common.brand}
      backHref={`/student/${trackId}`}
      backLabel={student.backTrack}
    >
      <p className="text-[12px] font-semibold tracking-[0.16em] text-[#1A7A72] uppercase">
        {student.tracks[trackId]} · {student.caseStudy.cardTitle}
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-landing-display)] text-[1.85rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.2rem]">
        {problem.title}
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#5C6570]">
        {problem.intro}
      </p>
      <p className="mt-3 max-w-xl text-[13px] leading-6 text-[#8A939D]">
        {student.caseStudy.pageIntro}
      </p>

      <div className="mt-8">
        <StudentCaseStudyForm problem={problem} copy={student} />
      </div>

      <p className="mt-8 text-[12px] leading-5 text-[#8A939D]">
        {student.studyDisclaimer}
      </p>
    </StudentShell>
  );
}
