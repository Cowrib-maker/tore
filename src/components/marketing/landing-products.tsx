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

/** Role-router color mapping: each role has its own icon tile color; the
 * audience label and CTA are brand-blue for every role. */
const PRODUCT_STYLE: Record<ProductKey, { icon: typeof Users; tile: string }> = {
  citizen: { icon: Users, tile: "bg-blue-50 text-blue-600" },
  student: { icon: GraduationCap, tile: "bg-sky-50 text-sky-600" },
  lawyer: { icon: Briefcase, tile: "bg-teal-50 text-teal-600" },
  firm: { icon: Building2, tile: "bg-amber-50 text-amber-600" },
  team: { icon: Users2, tile: "bg-purple-50 text-purple-600" },
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
    <div id="products" className="mt-14 scroll-mt-24">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item, index) => {
          const style = PRODUCT_STYLE[item.key];
          const Icon = style.icon;
          return (
            <LandingReveal key={item.key} delayMs={index * 50}>
              <article
                id={item.id}
                className="group flex h-full scroll-mt-28 flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-lg"
              >
                <span
                  className={`flex size-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${style.tile}`}
                >
                  <Icon className="size-5" />
                </span>
                {/* Name is the primary heading; the audience label is a
                    smaller, role-colored line beneath it -- matching
                    Stitch's hierarchy (name first, audience second). */}
                <h3 className="mt-5 text-lg leading-tight font-bold text-slate-900">
                  {item.copy.name}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-semibold text-blue-600">{item.copy.audience}</p>
                  {item.badge ? (
                    <span className="rounded-full bg-[#F7F8FB] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#5C6570]">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-500">
                  {item.copy.description}
                </p>
                <Link
                  href={hrefs[item.key]}
                  className="mt-6 inline-flex items-center gap-1.5 pt-2 text-sm font-bold text-blue-600 hover:text-blue-700"
                >
                  {item.copy.cta}
                  <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
                </Link>
              </article>
            </LandingReveal>
          );
        })}
      </div>
    </div>
  );
}
