import { Children, type ReactNode } from "react";
import Link from "next/link";

import { logoutAction } from "@/application/actions/auth.actions";
import { BRAND_LOGO_LANDING } from "@/components/brand/tokens";
import { BrandLink } from "@/components/layout/brand-link";
import type { LandingAuthUser } from "@/components/marketing/landing-nav";
import type { Dictionary } from "@/i18n/types";

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

  return (
    <footer className="border-t border-[#0B1F3A]/8 bg-[#EEF4F2]">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_LANDING} />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#5C6570]">
              {home.footerTagline}
            </p>
          </div>
          <FooterColumn title={home.navProducts}>
            <a href="#chat">{home.products.chat.name}</a>
            <a href="#student">{home.products.student.name}</a>
            <a href="#legal-ai">{home.products.legalAi.name}</a>
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
            © {year} {dict.common.brand}. {t.footerRights}
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
      <p className="text-[11px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
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
