import { Children, type ReactNode } from "react";
import Link from "next/link";

import { BrandTagline } from "@/components/brand/brand-tagline";
import { BRAND_LOGO_LANDING } from "@/components/brand/tokens";
import { BrandLink } from "@/components/layout/brand-link";
import type { Dictionary } from "@/i18n/types";

export function LandingFooter({ dict }: { dict: Dictionary }) {
  const t = dict.landing;
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[#0B1F3A]/8 bg-[#F7F8FA]">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="inline-flex flex-col items-center">
              <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_LANDING} />
              <BrandTagline />
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#5C6570]">
              {t.footerTagline}
            </p>
          </div>
          <FooterColumn title={t.footerProduct}>
            <a href="#platform">{t.footerPlatform}</a>
            <a href="#citizens">{t.footerSolutions}</a>
            <a href="#workspace">{t.footerLawyers}</a>
            <a href="#businesses">{t.footerBusinesses}</a>
            <a href="#enterprise">{t.footerEnterprise}</a>
            <a href="#how">{t.footerHow}</a>
          </FooterColumn>
          <FooterColumn title={t.footerAccounts}>
            <Link href="/login">{dict.common.signIn}</Link>
            <Link href="/register/client">{t.footerClientReg}</Link>
            <Link href="/register/lawyer">{t.footerLawyerReg}</Link>
            <Link href="/lawyers">{t.footerDirectory}</Link>
          </FooterColumn>
          <FooterColumn title={t.footerCompany}>
            <a href="#resources">{t.footerFaq}</a>
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
      <p className="text-[11px] font-semibold tracking-[0.12em] text-[#5C6570] uppercase">
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
