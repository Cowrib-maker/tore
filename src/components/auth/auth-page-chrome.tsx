import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { BrandLink } from "@/components/layout/brand-link";
import { BRAND_LOGO_SHELL } from "@/components/brand/tokens";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";

export function AuthPageChrome({
  children,
  locale,
  dict,
}: {
  children: React.ReactNode;
  locale: Locale;
  dict: Dictionary;
}) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-[#F4F8F6] p-6">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_SHELL} />
        <LanguageSwitcher
          locale={locale}
          label={dict.common.language}
        />
      </div>
      {children}
    </div>
  );
}
