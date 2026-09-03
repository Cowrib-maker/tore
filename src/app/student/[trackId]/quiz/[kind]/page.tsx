import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentQuizForm } from "@/components/student/student-quiz-form";
import { StudentProblemForm } from "@/components/student/student-problem-form";
import { StudentShell } from "@/components/student/student-shell";
import {
  getPublicTrackQuiz,
  getStudentProblem,
  parseStudentDifficulty,
  parseStudentQuizKind,
  parseStudentTrackId,
} from "@/domain/student";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function StudentQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ trackId: string; kind: string }>;
  searchParams: Promise<{ difficulty?: string }>;
}) {
  const { trackId: rawTrackId, kind: rawKind } = await params;
  const trackId = parseStudentTrackId(rawTrackId);
  const kind = parseStudentQuizKind(rawKind);
  if (!trackId || !kind) notFound();

  const difficulty = parseStudentDifficulty((await searchParams).difficulty);
  const quiz = kind === "test" ? getPublicTrackQuiz(trackId, kind, difficulty) : null;
  const problem = kind === "problem" ? getStudentProblem(trackId) : null;
  if (!quiz && !problem) notFound();

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
        {quiz?.title ?? problem?.title}
      </h1>
      {quiz ? (
        <nav aria-label="Тестийн түвшин" className="mt-5 flex flex-wrap gap-2">
          {[
            ["easy", "Суурь"],
            ["medium", "Дунд"],
            ["hard", "Ахисан"],
            ["expert", "Эксперт"],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={`/student/${trackId}/quiz/test?difficulty=${value}`}
              aria-current={difficulty === value ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition ${
                difficulty === value
                  ? "border-[#0B1F3A] bg-[#0B1F3A] text-white"
                  : "border-[#0B1F3A]/15 bg-white text-[#0B1F3A] hover:bg-[#EEF4F2]"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="mt-8">
        {quiz ? (
          <StudentQuizForm quiz={quiz} copy={student} />
        ) : problem ? (
          <StudentProblemForm problem={problem} />
        ) : null}
      </div>

      <p className="mt-8 text-[12px] leading-5 text-[#8A939D]">
        {student.studyDisclaimer}
      </p>
    </StudentShell>
  );
}
