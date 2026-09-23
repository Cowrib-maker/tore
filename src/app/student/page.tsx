import Link from "next/link";
import { BookOpen, FileText, MessagesSquare, PenSquare } from "lucide-react";

import { StudentOrthographyDraft } from "@/components/student/student-orthography-draft";
import { StudentShell } from "@/components/student/student-shell";
import { STUDENT_TRACK_IDS } from "@/domain/student";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function StudentHubPage() {
  const dict = await getDictionary();
  const home = dict.publicHome;
  const student = home.studentPage;

  const quickActions = [
    { icon: BookOpen, label: student.tracksTitle, href: "#tracks" },
    { icon: PenSquare, label: student.modules.tests, href: "#modules" },
    {
      icon: FileText,
      label: student.modules.problems,
      href: "#modules",
    },
    { icon: MessagesSquare, label: student.ctaChat, href: "/#chat" },
  ];

  return (
    <StudentShell
      brand={dict.common.brand}
      backHref="/"
      backLabel={student.backHome}
    >
      {/* Hero — same navy "premium legal workspace" identity used across
          the Legal AI surface and the Firm/Team workspace. */}
      <div className="rounded-2xl bg-[#0B1F3A] px-6 py-7 text-white sm:px-8 sm:py-8">
        <p className="text-[11px] font-semibold tracking-[0.22em] text-white/60 uppercase">
          {home.products.student.audience}
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-landing-display)] text-[1.85rem] tracking-[-0.03em] sm:text-[2.2rem]">
          {home.products.student.name}
        </h1>
        <p className="mt-2 inline-flex rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-white/80">
          {student.comingSoon}
        </p>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-white/70">
          {student.lead}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map(({ icon: Icon, label, href }) => (
          <Link
            key={label}
            href={href}
            className="flex flex-col items-start gap-2 rounded-xl border border-[#0B1F3A]/10 bg-white px-4 py-4 transition hover:border-[#0B5CFF]/40 hover:bg-[#E8F0FE]"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-[#E8F0FE] text-[#0B5CFF]">
              <Icon className="size-4" />
            </span>
            <p className="text-[13px] font-medium text-[#0B1F3A]">{label}</p>
          </Link>
        ))}
      </div>

      <section id="tracks" className="mt-10 scroll-mt-20">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#0B5CFF] uppercase">
          {student.tracksTitle}
        </h2>
        <ul className="mt-4 space-y-3">
          {STUDENT_TRACK_IDS.map((trackId) => (
            <li key={trackId}>
              <Link
                href={`/student/${trackId}`}
                className="block rounded-2xl border border-[#0B1F3A]/10 bg-white px-5 py-4 transition hover:border-[#0B5CFF]/40"
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

      <section id="modules" className="mt-10 scroll-mt-20">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#0B5CFF] uppercase">
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
