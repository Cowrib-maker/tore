import Link from "next/link";

import { StudentOrthographyDraft } from "@/components/student/student-orthography-draft";
import { StudentShell } from "@/components/student/student-shell";
import { STUDENT_TRACK_IDS } from "@/domain/student";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function StudentHubPage() {
  const dict = await getDictionary();
  const home = dict.publicHome;
  const student = home.studentPage;

  return (
    <StudentShell
      brand={dict.common.brand}
      backHref="/"
      backLabel={student.backHome}
    >
      <p className="text-[12px] font-semibold tracking-[0.16em] text-[#1A7A72] uppercase">
        {home.products.student.audience}
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-landing-display)] text-[2rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.4rem]">
        {home.products.student.name}
      </h1>
      <p className="mt-2 inline-flex rounded-full bg-[#E8F4F1] px-3 py-1 text-[12px] font-semibold text-[#1A7A72]">
        {student.comingSoon}
      </p>
      <p className="mt-5 max-w-xl text-[15px] leading-7 text-[#5C6570]">
        {student.lead}
      </p>

      <section className="mt-10">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
          {student.tracksTitle}
        </h2>
        <ul className="mt-4 space-y-3">
          {STUDENT_TRACK_IDS.map((trackId) => (
            <li key={trackId}>
              <Link
                href={`/student/${trackId}`}
                className="block rounded-2xl border border-[#0B1F3A]/10 bg-white px-5 py-4 transition hover:border-[#1A7A72]/40"
              >
                <p className="text-[16px] font-semibold text-[#0B1F3A]">
                  {student.tracks[trackId]}
                </p>
                <p className="mt-1 text-[13px] leading-6 text-[#5C6570]">
                  {student.trackLeads[trackId]}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
          {student.modulesTitle}
        </h2>
        <ol className="mt-4 space-y-2">
          {(
            [
              "theory",
              "method",
              "tests",
              "problems",
            ] as const
          ).map((key, index) => (
            <li
              key={key}
              className="flex items-start gap-3 rounded-xl border border-[#0B1F3A]/8 bg-white px-4 py-3"
            >
              <span className="font-mono text-[11px] text-[#8A939D]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-[14px] font-medium text-[#0B1F3A]">
                {student.modules[key]}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-10">
        <StudentOrthographyDraft billingHref="/#chat" />
      </div>

      <p className="mt-8 text-[13px] leading-6 text-[#7B8490]">
        {student.disclaimer}
      </p>
      <p className="mt-3 text-[12px] leading-5 text-[#8A939D]">
        {student.studyDisclaimer}
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/#feedback"
          className="inline-flex h-11 items-center justify-center rounded-full bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#16365F]"
        >
          {student.ctaFeedback}
        </Link>
        <Link
          href="/#chat"
          className="inline-flex h-11 items-center justify-center rounded-full border border-[#0B1F3A]/15 bg-white px-5 text-[13px] font-semibold text-[#0B1F3A] transition hover:bg-[#EEF4F2]"
        >
          {student.ctaChat}
        </Link>
      </div>
    </StudentShell>
  );
}
