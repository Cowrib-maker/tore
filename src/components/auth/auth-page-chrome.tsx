import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { BrandLink } from "@/components/layout/brand-link";
import { BRAND_LOGO_SHELL } from "@/components/brand/tokens";
import { ThemeToggle } from "@/components/theme/theme-toggle";
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
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-secondary p-6">
      <div className="absolute inset-x-0 top-0 z-10 flex h-[4.5rem] items-center justify-between px-5 sm:px-8">
        <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_SHELL} />
        <div className="flex items-center gap-2">
          <LanguageSwitcher
            locale={locale}
            label={dict.common.language}
          />
          <ThemeToggle />
        </div>
      </div>
      {children}
    </div>
  );
}
