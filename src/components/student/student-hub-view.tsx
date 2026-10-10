import Link from "next/link";
import {
  BookOpen,
  BriefcaseBusiness,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  FileText,
  GraduationCap,
  NotebookPen,
  PenSquare,
  Scale,
} from "lucide-react";

import { LandingNav } from "@/components/marketing/landing-nav";
import { StudentOrthographyDraft } from "@/components/student/student-orthography-draft";
import { StudentShell, studentSidebarItems } from "@/components/student/student-shell";
import { WorkspaceAiComposer } from "@/components/workspace/workspace-ai-composer";
import { WorkspaceQuickAction } from "@/components/workspace/workspace-quick-action";
import {
  getPublicTrackQuiz,
  listStudentLessons,
  STUDENT_TRACK_IDS,
  type StudentTrackId,
} from "@/domain/student";

/**
 * Track card visuals. Administrative law deliberately has no photo: the only
 * candidate was a recognizable foreign (US) Supreme Court building, which must
 * not represent Mongolian legal education, and the repository has no
 * project-owned Mongolian imagery. It gets a neutral project-authored
 * gradient + document icon instead, at the same card size/crop.
 */
const TRACK_IMAGE: Record<StudentTrackId, string | null> = {
  criminal: "/student/track-scales.jpg",
  civil: "/student/track-books.jpg",
  administrative: null,
};

import type { LandingAuthUser } from "@/components/marketing/landing-nav";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";

/** Student hub page body. Pure: everything it shows comes from props, so the admin preview can render it for a synthetic visitor. */
export function StudentHubView({ dict, locale, authUser }: { dict: Dictionary; locale: Locale; authUser: LandingAuthUser | null }) {
  const home = dict.publicHome;
  const student = home.studentPage;
  const org = dict.organizations;

  const firstTrack = STUDENT_TRACK_IDS[0]!;
  const trackCards = STUDENT_TRACK_IDS.map((trackId) => ({
    trackId,
    lessons: listStudentLessons(trackId).length,
    questions: getPublicTrackQuiz(trackId, "test")?.questions.length ?? 0,
  }));

  return (
    <StudentShell
      brand={dict.common.brand}
      backHref="/"
      backLabel={student.backHome}
      sidebar={studentSidebarItems("home")}
      siteHeader={<LandingNav dict={dict} locale={locale} authUser={authUser} />}
      sidebarFooter={
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
          <p className="text-xs font-bold text-slate-900">{student.tracksTitle}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {STUDENT_TRACK_IDS.length} салбар нээлттэй байна.
          </p>
          <Link
            href="/student#tracks"
            className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0B192C] px-3 py-2.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-900"
          >
            {student.tracksTitle}
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      }
      rail={
        <>
          <div
            id="modules"
            className="scroll-mt-24 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm"
          >
            <h3 className="mb-3 text-sm font-bold text-slate-900">{student.modulesTitle}</h3>
            <ul className="divide-y divide-slate-100">
              {(
                [
                  { key: "theory", icon: BookOpen, tile: "bg-blue-50 text-blue-600" },
                  { key: "method", icon: NotebookPen, tile: "bg-teal-50 text-teal-600" },
                  { key: "tests", icon: PenSquare, tile: "bg-purple-50 text-purple-600" },
                  { key: "problems", icon: ClipboardCheck, tile: "bg-emerald-50 text-emerald-600" },
                ] as const
              ).map(({ key, icon: Icon, tile }) => (
                <li key={key} className="flex items-center gap-3 py-2.5">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tile}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="text-xs font-bold text-slate-800">{student.modules[key]}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Шалгалтын бэлтгэл</h3>
            <ul className="divide-y divide-slate-100">
              {[
                {
                  href: `/student/${firstTrack}/quiz/test`,
                  title: student.modules.tests,
                  note: student.tracks[firstTrack],
                },
                {
                  href: `/student/${firstTrack}/quiz/problem`,
                  title: student.modules.problems,
                  note: student.tracks[firstTrack],
                },
                {
                  href: `/student/${firstTrack}/case-study`,
                  title: home.studentPage.caseStudy.cardTitle,
                  note: student.tracks[firstTrack],
                },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group -mx-1.5 flex items-center justify-between rounded-xl px-1.5 py-2.5 transition-colors hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-slate-800 transition-colors group-hover:text-blue-600">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">{item.note}</span>
                    </span>
                    <ChevronRight className="ml-2 size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      }
    >
      {/* Hero banner */}
      <div className="relative flex min-h-[290px] flex-col justify-between overflow-hidden rounded-3xl bg-slate-900 p-7 text-white shadow-md lg:p-9">
        <div aria-hidden className="absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src="/student/hero-library.jpg"
            className="size-full object-cover object-center opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/80 to-transparent" />
        </div>

        <div className="relative z-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="max-w-xl">
            <span className="mb-2 block text-[11px] font-bold tracking-widest text-blue-400 uppercase">
              TORE STUDENT
            </span>
            <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-white sm:text-3xl lg:text-4xl">
              Хуулийг судалж, <br className="hidden sm:inline" />
              ирээдүйн шийдлийг <span className="text-blue-500">бүтээ.</span>
            </h1>
            <p className="mt-2.5 text-sm font-normal text-slate-300 sm:text-base">
              Суралцах, судлах, ойлгох — хуулийн замд таны хамт.
            </p>
          </div>
          <div className="mt-2 hidden max-w-[240px] self-start rounded-2xl border border-white/15 bg-white/10 p-4 text-right backdrop-blur-md xl:block">
            <p className="text-xs leading-relaxed text-slate-200 italic">
              &ldquo;Хуулийн мэдлэг илүү сайхан нийгмийг бүтээдэг.&rdquo;
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-6 text-[#0B1F3A]">
          <WorkspaceAiComposer
            placeholder="Хууль, кейс, ойлголтын талаар асуух..."
            attachLabel={org.composerAttach}
            aiLabel="AI сонгох"
            knowledgeLabel="Вэбээс хайх"
            comingSoonLabel={org.comingSoonTag}
          />
        </div>
      </div>

      {/* Quick study cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <WorkspaceQuickAction
          icon={GraduationCap}
          iconClassName="bg-blue-50 text-blue-600"
          title="Хууль судлах"
          description="Хууль, зүйл заалт, эх сурвалж хайх"
          href="#tracks"
        />
        <WorkspaceQuickAction
          icon={BriefcaseBusiness}
          iconClassName="bg-teal-50 text-teal-600"
          title="Кейс судлах"
          description="Шүүхийн шийдвэр, кейс дүн шинжилгээ"
          href={`/student/${firstTrack}/case-study`}
        />
        <WorkspaceQuickAction
          icon={PenSquare}
          iconClassName="bg-purple-50 text-purple-600"
          title="Тест хийх"
          description="Шалгалтын бэлтгэл, сорил"
          href={`/student/${firstTrack}/quiz/test`}
        />
        <WorkspaceQuickAction
          icon={FileSearch}
          iconClassName="bg-sky-50 text-sky-600"
          title="Баримт бичиг шинжлэх"
          description="PDF, гэрээ, бодлого зэрэг баримт бичгүүд"
          comingSoonLabel={org.comingSoonTag}
        />
      </div>

      {/* Tracks: real content (lesson / test counts come from the domain data) */}
      <section id="tracks" className="mt-8 scroll-mt-24 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <h2 className="-mb-2.5 border-b-2 border-blue-600 pb-2 text-sm font-semibold text-blue-600">
            {student.tracksTitle}
          </h2>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trackCards.map(({ trackId, lessons, questions }) => (
            <li key={trackId}>
              <Link
                href={`/student/${trackId}`}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white transition-all hover:shadow-lg"
              >
                <div className="relative h-32 w-full overflow-hidden bg-slate-100">
                  {TRACK_IMAGE[trackId] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      src={TRACK_IMAGE[trackId]!}
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="flex size-full items-center justify-center bg-gradient-to-br from-[#0B192C] via-[#13294B] to-[#2563EB] transition-transform duration-300 group-hover:scale-105"
                    >
                      <FileText className="size-12 text-white/85" strokeWidth={1.4} />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3.5">
                  <span className="mb-2 inline-block w-fit rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase">
                    <Scale className="mr-1 inline size-3 align-[-1px]" />
                    {student.tracksTitle}
                  </span>
                  <h3 className="line-clamp-2 text-sm font-bold text-slate-800 transition-colors group-hover:text-blue-600">
                    {student.tracks[trackId]}
                  </h3>
                  <p className="mt-1 text-xs leading-snug text-slate-500">
                    {student.trackLeads[trackId]}
                  </p>
                  {lessons > 0 || questions > 0 ? (
                    <p className="mt-auto pt-3 text-xs font-medium text-slate-400">
                      {[
                        lessons > 0 ? `${lessons} хичээл` : null,
                        questions > 0 ? `${questions} асуулт` : null,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 max-w-2xl">
        <StudentOrthographyDraft billingHref="/#chat" />
      </div>

      <p className="mt-8 max-w-2xl text-[13px] leading-6 text-[#7B8490]">{student.disclaimer}</p>
      <p className="mt-3 max-w-2xl text-[12px] leading-5 text-[#8A939D]">{student.studyDisclaimer}</p>

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
