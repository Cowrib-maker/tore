import Link from "next/link";
import { FileText, GraduationCap, MessageCircle } from "lucide-react";

import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { Dictionary } from "@/i18n/types";

type ProductKey = "chat" | "student" | "legalAi";

const PRODUCT_ICONS: Record<ProductKey, typeof MessageCircle> = {
  chat: MessageCircle,
  student: GraduationCap,
  legalAi: FileText,
};

export function LandingProducts({
  home,
  hrefs,
}: {
  home: Dictionary["publicHome"];
  hrefs: Record<ProductKey, string>;
}) {
  const items: Array<{
    key: ProductKey;
    id: string;
    copy: Dictionary["publicHome"]["products"][ProductKey];
    badge?: string;
  }> = [
    { key: "chat", id: "citizen", copy: home.products.chat },
    {
      key: "student",
      id: "student",
      copy: home.products.student,
      badge: home.studentComingSoon,
    },
    { key: "legalAi", id: "legal-ai", copy: home.products.legalAi },
  ];

  return (
    <section
      id="products"
      className="scroll-mt-24 border-b border-[#0B1F3A]/8 bg-white"
    >
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
        <LandingReveal className="mx-auto max-w-xl text-center">
          <p className="text-[12px] font-semibold tracking-[0.16em] text-[#0B5CFF] uppercase">
            {home.productsEyebrow}
          </p>
        </LandingReveal>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {items.map((item, index) => {
            const Icon = PRODUCT_ICONS[item.key];
            return (
            <LandingReveal key={item.key} delayMs={index * 50}>
              <article
                id={item.id}
                className="flex h-full scroll-mt-28 flex-col rounded-2xl border border-[#0B1F3A]/10 bg-white p-5 shadow-[0_1px_2px_rgba(11,31,58,0.03),0_8px_22px_-14px_rgba(11,31,58,0.1)] sm:p-6"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#E8F0FE] text-[#0B5CFF]">
                  <Icon className="size-5" />
                </span>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold tracking-[0.12em] text-[#0B5CFF] uppercase">
                    {item.copy.audience}
                  </p>
                  {item.badge ? (
                    <span className="rounded-full bg-[#F7F8FB] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#5C6570]">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-2 text-[17px] font-semibold tracking-tight text-[#0B1F3A]">
                  {item.copy.name}
                </h3>
                <p className="mt-3 flex-1 text-[13px] leading-relaxed text-[#5C6570]">
                  {item.copy.description}
                </p>
                <Link
                  href={hrefs[item.key]}
                  className="mt-5 inline-flex text-[13px] font-semibold text-[#0B1F3A] transition hover:text-[#0B5CFF]"
                >
                  {item.copy.cta}
                </Link>
              </article>
            </LandingReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
