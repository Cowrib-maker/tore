import { notFound } from "next/navigation";

import { StudentCaseStudyForm } from "@/components/student/student-case-study-form";
import { StudentWrittenExamForm } from "@/components/student/student-written-exam-form";
import { StudentShell } from "@/components/student/student-shell";
import { getStudentLegalProblem, parseStudentTrackId } from "@/domain/student";
import { getWrittenExamProblem } from "@/domain/student/written-exam-problems";
import { getWrittenExamPageStateUseCase } from "@/application/use-cases/student/get-attempt-history";
import { resolveGuestSession } from "@/application/legal-ai/resolve-guest-session";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function StudentCaseStudyPage({
  params,
}: {
  params: Promise<{ trackId: string }>;
}) {
  const { trackId: rawTrackId } = await params;
  const trackId = parseStudentTrackId(rawTrackId);
  if (!trackId) notFound();

  const dict = await getDictionary();
  const student = dict.publicHome.studentPage;

  // Administrative is the first (and only, this sprint) track on the new
  // source-backed written-exam / AI-tutor pipeline — see req #9/#14.
  // Civil/criminal stay on the legacy StudentLegalProblem flow below
  // until their own doctrine is built the same way.
  const writtenExamProblem = getWrittenExamProblem(trackId);
  if (writtenExamProblem) {
    // Read-only: a Server Component page render can't set cookies (only a
    // Server Action or Route Handler can — see resolveGuestSession's other
    // callers), and a brand-new visitor has no attempt history to show
    // anyway. The actual guest session is created on first submit, inside
    // the submitWrittenAttempt Server Action.
    const guestSession = await resolveGuestSession({ createIfMissing: false });
    const pageState = guestSession
      ? await getWrittenExamPageStateUseCase({
          problemId: writtenExamProblem.id,
          guestSessionId: guestSession.id,
        })
      : null;
    const attempt = pageState && !("error" in pageState) ? pageState.attempt : null;

    return (
      <StudentShell brand={dict.common.brand} backHref={`/student/${trackId}`} backLabel={student.backTrack}>
        <p className="text-[12px] font-semibold tracking-[0.16em] text-[#1A7A72] uppercase">
          {student.tracks[trackId]} · {student.caseStudy.cardTitle}
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-landing-display)] text-[1.85rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.2rem]">
          {writtenExamProblem.title}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#5C6570]">{writtenExamProblem.intro}</p>

        <div className="mt-8">
          <StudentWrittenExamForm problem={writtenExamProblem} initialAttempt={attempt} />
        </div>

        <p className="mt-8 text-[12px] leading-5 text-[#8A939D]">{student.studyDisclaimer}</p>
      </StudentShell>
    );
  }

  const problem = getStudentLegalProblem(trackId);
  if (!problem) notFound();

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
