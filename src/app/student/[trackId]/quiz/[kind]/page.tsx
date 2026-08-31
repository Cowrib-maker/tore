import { notFound } from "next/navigation";

import { StudentQuizForm } from "@/components/student/student-quiz-form";
import { StudentShell } from "@/components/student/student-shell";
import {
  getPublicTrackQuiz,
  parseStudentQuizKind,
  parseStudentTrackId,
} from "@/domain/student";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function StudentQuizPage({
  params,
}: {
  params: Promise<{ trackId: string; kind: string }>;
}) {
  const { trackId: rawTrackId, kind: rawKind } = await params;
  const trackId = parseStudentTrackId(rawTrackId);
  const kind = parseStudentQuizKind(rawKind);
  if (!trackId || !kind) notFound();

  const quiz = getPublicTrackQuiz(trackId, kind);
  if (!quiz) notFound();

  const dict = await getDictionary();
  const student = dict.publicHome.studentPage;
  const kindLabel =
    kind === "test" ? student.modules.tests : student.modules.problems;

  return (
    <StudentShell
      brand={dict.common.brand}
      backHref={`/student/${trackId}`}
      backLabel={student.backTrack}
    >
      <p className="text-[12px] font-semibold tracking-[0.16em] text-[#1A7A72] uppercase">
        {student.tracks[trackId]} · {kindLabel}
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-landing-display)] text-[1.85rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.2rem]">
        {quiz.title}
      </h1>

      <div className="mt-8">
        <StudentQuizForm quiz={quiz} copy={student} />
      </div>

      <p className="mt-8 text-[12px] leading-5 text-[#8A939D]">
        {student.studyDisclaimer}
      </p>
    </StudentShell>
  );
}
