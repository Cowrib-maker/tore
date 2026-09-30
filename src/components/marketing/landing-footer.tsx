import { Children, type ReactNode } from "react";
import Link from "next/link";
import { BadgeCheck, FileCheck2, Lock, ShieldCheck } from "lucide-react";

import { logoutAction } from "@/application/actions/auth.actions";
import { BRAND_LOGO_LANDING } from "@/components/brand/tokens";
import { BrandLink } from "@/components/layout/brand-link";
import type { LandingAuthUser } from "@/components/marketing/landing-nav";
import { TORE_LEGAL_ENTITY_NAME } from "@/domain/constants/site-identity";
import type { Dictionary } from "@/i18n/types";

/** Fixed order into `landing.trustItems` for the compact footer strip --
 * privacy, security, sourced answers, verified professionals. Labels come
 * straight from the existing trust-section copy (never new/invented text),
 * matching an institutional trust-bar composition without claiming any
 * specific, unverified partner organization. */
const TRUST_STRIP_INDEXES = [0, 1, 2, 5];
const TRUST_STRIP_ICONS = [Lock, ShieldCheck, FileCheck2, BadgeCheck];

export function LandingFooter({
  dict,
  authUser,
}: {
  dict: Dictionary;
  authUser?: LandingAuthUser | null;
}) {
  const t = dict.landing;
  const home = dict.publicHome;
  const year = new Date().getFullYear();
  const trustStripItems = TRUST_STRIP_INDEXES.map((index) => t.trustItems[index]).filter(
    (item): item is { title: string; description: string } => Boolean(item),
  );

  return (
    <footer className="border-t border-[#0B1F3A]/8 bg-[#EEF3FB]">
      {trustStripItems.length > 0 ? (
        <div className="border-b border-[#0B1F3A]/8 bg-[#0B1F3A]">
          <div className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:justify-between">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-white/50 uppercase">
                {t.trustEyebrow}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2.5">
                {trustStripItems.map((item, index) => {
                  const Icon = TRUST_STRIP_ICONS[index] ?? ShieldCheck;
                  return (
                    <span
                      key={item.title}
                      className="inline-flex items-center gap-2 text-[13px] font-medium text-white/85"
                    >
                      <Icon className="size-4 text-white/60" />
                      {item.title}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_LANDING} />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#5C6570]">
              {home.footerTagline}
            </p>
          </div>
          <FooterColumn title={home.navProducts}>
            <a href="#chat">{home.products.citizen.name}</a>
            <a href="#student">{home.products.student.name}</a>
            <a href="#lawyer">{home.products.lawyer.name}</a>
            <a href="#firm">{home.products.firm.name}</a>
            <a href="#team">{home.products.team.name}</a>
            <Link href="/lawyers">{t.footerDirectory}</Link>
            <a href="#intelligence">{home.intelligenceTitle}</a>
          </FooterColumn>
          <FooterColumn title={t.footerCompany}>
            {authUser ? (
              <>
                <Link href={authUser.dashboardHref}>{authUser.displayName}</Link>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="cursor-pointer text-left transition-colors hover:text-[#0B1F3A]"
                  >
                    {dict.common.signOut}
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login">{dict.common.signIn}</Link>
                <Link href="/register/client">{t.footerClientReg}</Link>
                <Link href="/register/lawyer">{t.footerLawyerReg}</Link>
              </>
            )}
            <a href="#feedback">{home.navFeedback}</a>
            <Link href="/terms">{t.footerTerms}</Link>
            <Link href="/privacy">{t.footerPrivacy}</Link>
          </FooterColumn>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-[#0B1F3A]/8 pt-6 text-xs text-[#5C6570] sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {TORE_LEGAL_ENTITY_NAME}. {t.footerRights}
          </p>
          <p>{t.footerBuilt}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.12em] text-[#0B5CFF] uppercase">
        {title}
      </p>
      <ul className="mt-3 space-y-2.5 text-sm text-[#3D4A57] [&_a]:transition-colors [&_a]:hover:text-[#0B1F3A]">
        {Children.toArray(children).map((child, index) => (
          <li key={index}>{child}</li>
        ))}
      </ul>
    </div>
  );
}
