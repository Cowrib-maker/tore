import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentShell } from "@/components/student/student-shell";
import {
  getStudentLesson,
  parseStudentTrackId,
} from "@/domain/student";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function StudentLessonPage({
  params,
}: {
  params: Promise<{ trackId: string; lessonId: string }>;
}) {
  const { trackId: rawTrackId, lessonId } = await params;
  const trackId = parseStudentTrackId(rawTrackId);
  if (!trackId) notFound();

  const lesson = getStudentLesson(trackId, lessonId);
  if (!lesson) notFound();

  const dict = await getDictionary();
  const student = dict.publicHome.studentPage;
  const kindLabel =
    lesson.kind === "method"
      ? student.modules.method
      : student.modules.theory;

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
        {lesson.title}
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#5C6570]">
        {lesson.summary}
      </p>

      <div className="mt-10 space-y-6">
        {lesson.sections.map((section) => (
          <section
            key={section.heading}
            className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5"
          >
            <h2 className="text-[15px] font-semibold text-[#0B1F3A]">
              {section.heading}
            </h2>
            <p className="mt-3 text-[14px] leading-7 text-[#5C6570]">
              {section.body}
            </p>
          </section>
        ))}
      </div>

      <p className="mt-8 text-[12px] leading-5 text-[#8A939D]">
        {student.studyDisclaimer}
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/student/${trackId}/quiz/test`}
          className="inline-flex h-11 items-center justify-center rounded-full bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#16365F]"
        >
          {student.modules.tests}
        </Link>
        <Link
          href={`/student/${trackId}/quiz/problem`}
          className="inline-flex h-11 items-center justify-center rounded-full border border-[#0B1F3A]/15 bg-white px-5 text-[13px] font-semibold text-[#0B1F3A] transition hover:bg-[#EEF4F2]"
        >
          {student.modules.problems}
        </Link>
      </div>
    </StudentShell>
  );
}
