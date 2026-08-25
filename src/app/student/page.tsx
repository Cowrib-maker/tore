import Link from "next/link";

import { BRAND_LOGO_LANDING } from "@/components/brand/tokens";
import { BrandLink } from "@/components/layout/brand-link";
import { getDictionary } from "@/i18n/get-dictionary";

const STUDENT_MODULES = [
  "theory",
  "library",
  "lawLibrary",
  "courtLibrary",
  "problems",
  "exams",
  "aiTutor",
  "progress",
] as const;

export default async function StudentComingSoonPage() {
  const dict = await getDictionary();
  const home = dict.publicHome;
  const student = home.studentPage;

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#0A0F14]">
      <header className="border-b border-[#0B1F3A]/8 bg-[#F7F6F2]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_LANDING} />
          <Link
            href="/"
            className="text-[13px] font-medium text-[#5C6570] transition hover:text-[#0B1F3A]"
          >
            {student.backHome}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
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
            {student.modulesTitle}
          </h2>
          <ol className="mt-4 space-y-2">
            {STUDENT_MODULES.map((key, index) => (
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

        <section className="mt-10 grid gap-3 sm:grid-cols-2">
          <PriceCard
            name={student.planBasic}
            price={student.priceBasic}
            note={student.perMonth}
          />
          <PriceCard
            name={student.planPlus}
            price={student.pricePlus}
            note={student.perMonth}
          />
        </section>

        <p className="mt-8 text-[13px] text-[#7B8490]">{student.disclaimer}</p>

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
      </main>
    </div>
  );
}

function PriceCard({
  name,
  price,
  note,
}: {
  name: string;
  price: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5">
      <p className="text-[13px] font-semibold text-[#0B1F3A]">{name}</p>
      <p className="mt-2 text-[1.5rem] font-semibold tracking-tight text-[#0B1F3A]">
        {price}
      </p>
      <p className="mt-1 text-[12px] text-[#8A939D]">{note}</p>
    </div>
  );
}
