import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentShell } from "@/components/student/student-shell";
import {
  getStudentLesson,
  getStudentTheoryCourse,
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
  const course = getStudentTheoryCourse(trackId, lessonId);
  if (!lesson || !course) notFound();

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
      <h1 className="mt-3 font-[family-name:var(--font-landing-display)] text-[1.85rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.2rem]">
        {course.lesson}
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#5C6570]">
        {course.subject} · {kindLabel}
      </p>

      <section className="mt-10 border-y border-[#0B1F3A]/10 py-5">
        <h2 className="text-[15px] font-semibold text-[#0B1F3A]">Сэдэв</h2>
        <p className="mt-2 text-[14px] leading-7 text-[#5C6570]">{course.topic}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold text-[#0B1F3A]">Суралцах зорилго</h2>
        <ul className="mt-3 space-y-2 text-[14px] leading-7 text-[#5C6570]">
          {course.objectives.map((objective) => <li key={objective}>— {objective}</li>)}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold text-[#0B1F3A]">Гол ойлголт ба тайлбар</h2>
        <div className="mt-3 divide-y divide-[#0B1F3A]/10 border-y border-[#0B1F3A]/10">
          {course.explanation.map((section) => (
            <div key={section.heading} className="py-5">
              <h3 className="text-[14px] font-semibold text-[#0B1F3A]">{section.heading}</h3>
              <p className="mt-2 text-[14px] leading-7 text-[#5C6570]">{section.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold text-[#0B1F3A]">Холбогдох Монгол эх сурвалж</h2>
        <ul className="mt-3 divide-y divide-[#0B1F3A]/10 border-y border-[#0B1F3A]/10">
          {course.legalSources.map((source) => (
            <li key={source.url} className="py-4">
              <a href={source.url} target="_blank" rel="noreferrer" className="font-semibold text-[#0B1F3A] underline underline-offset-4 hover:text-[#1A7A72]">
                {source.title}
              </a>
              <p className="mt-1 text-[13px] leading-6 text-[#5C6570]">{source.publisher} · {source.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold text-[#0B1F3A]">Жишээ</h2>
        {course.examples.map((example) => <p key={example} className="mt-3 text-[14px] leading-7 text-[#5C6570]">{example}</p>)}
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold text-[#0B1F3A]">Давтах асуулт</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] leading-7 text-[#5C6570]">
          {course.review.map((question) => <li key={question}>{question}</li>)}
        </ol>
      </section>

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
