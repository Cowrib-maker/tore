import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Building2,
  GraduationCap,
  Users,
  Users2,
} from "lucide-react";

import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { Dictionary } from "@/i18n/types";

type ProductKey = "citizen" | "student" | "lawyer" | "firm" | "team";

/** Stitch's role-router color mapping: Citizen/Student share blue (both are
 * the individual-user track), Lawyer is teal, Firm is amber, Team is purple. */
const PRODUCT_STYLE: Record<
  ProductKey,
  { icon: typeof Users; tile: string; text: string }
> = {
  citizen: { icon: Users, tile: "bg-[#E8F0FE]", text: "text-[#0B5CFF]" },
  student: { icon: GraduationCap, tile: "bg-[#E8F0FE]", text: "text-[#0B5CFF]" },
  lawyer: { icon: Briefcase, tile: "bg-[#E1F5F2]", text: "text-[#0F766E]" },
  firm: { icon: Building2, tile: "bg-[#FDF0D5]", text: "text-[#B45309]" },
  team: { icon: Users2, tile: "bg-[#F1EAFB]", text: "text-[#7C3AED]" },
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
    { key: "citizen", id: "citizen", copy: home.products.citizen },
    {
      key: "student",
      id: "student",
      copy: home.products.student,
      badge: home.studentComingSoon || undefined,
    },
    { key: "lawyer", id: "lawyer", copy: home.products.lawyer },
    { key: "firm", id: "firm", copy: home.products.firm },
    { key: "team", id: "team", copy: home.products.team },
  ];

  return (
    // No <section>/border/background of its own, and no eyebrow heading --
    // this is a direct continuation of the hero it's rendered inside
    // (LandingHero), not an independent page section. `scroll-mt-24` is
    // kept on the id target so the header's "#products" anchor still lands
    // in a sensible spot.
    <div id="products" className="scroll-mt-24 pt-10 pb-8 sm:pt-12 sm:pb-10">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item, index) => {
          const style = PRODUCT_STYLE[item.key];
          const Icon = style.icon;
          return (
            <LandingReveal key={item.key} delayMs={index * 50}>
              <article
                id={item.id}
                className="flex h-full scroll-mt-28 flex-col rounded-2xl border border-[#0B1F3A]/10 bg-white p-5 shadow-[0_1px_2px_rgba(11,31,58,0.03),0_8px_22px_-14px_rgba(11,31,58,0.1)] sm:p-6"
              >
                <span
                  className={`flex size-10 items-center justify-center rounded-xl ${style.tile} ${style.text}`}
                >
                  <Icon className="size-5" />
                </span>
                {/* Name is the primary heading; the audience label is a
                    smaller, role-colored line beneath it -- matching
                    Stitch's hierarchy (name first, audience second). */}
                <h3 className="mt-4 text-[17px] font-semibold tracking-tight text-[#0B1F3A]">
                  {item.copy.name}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className={`text-[13px] font-medium ${style.text}`}>{item.copy.audience}</p>
                  {item.badge ? (
                    <span className="rounded-full bg-[#F7F8FB] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#5C6570]">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 flex-1 text-[13px] leading-relaxed text-[#5C6570]">
                  {item.copy.description}
                </p>
                <Link
                  href={hrefs[item.key]}
                  className="group mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0B1F3A] transition hover:text-[#0B5CFF]"
                >
                  {item.copy.cta}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </article>
            </LandingReveal>
          );
        })}
      </div>
    </div>
  );
}
