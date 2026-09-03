import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentShell } from "@/components/student/student-shell";
import {
  getPublicTrackQuiz,
  getStudentProblem,
  listStudentLessons,
  parseStudentTrackId,
} from "@/domain/student";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function StudentTrackPage({
  params,
}: {
  params: Promise<{ trackId: string }>;
}) {
  const { trackId: rawTrackId } = await params;
  const trackId = parseStudentTrackId(rawTrackId);
  if (!trackId) notFound();

  const dict = await getDictionary();
  const student = dict.publicHome.studentPage;
  const methodLessons = listStudentLessons(trackId, "method");
  const theoryLessons = listStudentLessons(trackId, "theory");
  const testQuiz = getPublicTrackQuiz(trackId, "test");
  const problemQuiz = getStudentProblem(trackId);

  return (
    <StudentShell
      brand={dict.common.brand}
      backHref="/student"
      backLabel={student.backHome}
    >
      <p className="text-[12px] font-semibold tracking-[0.16em] text-[#1A7A72] uppercase">
        {student.tracksTitle}
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-landing-display)] text-[2rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.35rem]">
        {student.tracks[trackId]}
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#5C6570]">
        {student.trackLeads[trackId]}
      </p>

      <LessonGroup
        title={student.modules.method}
        lessons={methodLessons}
        trackId={trackId}
        openLabel={student.openLesson}
      />
      <LessonGroup
        title={student.modules.theory}
        lessons={theoryLessons}
        trackId={trackId}
        openLabel={student.openLesson}
      />

      <section className="mt-10">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
          {student.modules.exams}
        </h2>
        <ul className="mt-4 space-y-3">
          {testQuiz ? (
            <QuizCard
              href={`/student/${trackId}/quiz/test`}
              title={testQuiz.title}
              intro={testQuiz.intro}
              cta={student.startQuiz}
              badge={student.modules.tests}
            />
          ) : null}
          {problemQuiz ? (
            <QuizCard
              href={`/student/${trackId}/quiz/problem`}
              title={problemQuiz.title}
              intro={problemQuiz.intro}
              cta={student.startQuiz}
              badge={student.modules.problems}
            />
          ) : null}
        </ul>
      </section>

      <p className="mt-8 text-[12px] leading-5 text-[#8A939D]">
        {student.studyDisclaimer}
      </p>
    </StudentShell>
  );
}

function LessonGroup({
  title,
  lessons,
  trackId,
  openLabel,
}: {
  title: string;
  lessons: ReturnType<typeof listStudentLessons>;
  trackId: string;
  openLabel: string;
}) {
  if (lessons.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
        {title}
      </h2>
      <ul className="mt-4 space-y-3">
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <Link
              href={`/student/${trackId}/lesson/${lesson.id}`}
              className="block rounded-2xl border border-[#0B1F3A]/10 bg-white px-5 py-4 transition hover:border-[#1A7A72]/40"
            >
              <p className="text-[15px] font-semibold text-[#0B1F3A]">
                {lesson.title}
              </p>
              <p className="mt-1 text-[13px] leading-6 text-[#5C6570]">
                {lesson.summary}
              </p>
              <span className="mt-3 inline-flex text-[13px] font-semibold text-[#0B1F3A]">
                {openLabel}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuizCard({
  href,
  title,
  intro,
  cta,
  badge,
}: {
  href: string;
  title: string;
  intro: string;
  cta: string;
  badge: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-2xl border border-[#0B1F3A]/10 bg-white px-5 py-4 transition hover:border-[#1A7A72]/40"
      >
        <p className="text-[11px] font-semibold tracking-wide text-[#1A7A72] uppercase">
          {badge}
        </p>
        <p className="mt-2 text-[15px] font-semibold text-[#0B1F3A]">{title}</p>
        <p className="mt-1 text-[13px] leading-6 text-[#5C6570]">{intro}</p>
        <span className="mt-3 inline-flex text-[13px] font-semibold text-[#0B1F3A]">
          {cta}
        </span>
      </Link>
    </li>
  );
}
