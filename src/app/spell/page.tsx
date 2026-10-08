import type { Metadata } from "next";

import { getSessionUser } from "@/application/common/session";
import { SpellLanding } from "@/components/marketing/spell-landing";
import type { UserRole } from "@/domain/enums";
import { isQpayConfigured } from "@/infrastructure/billing/create-qpay-gateway";
import { getSpellInstallerUrl } from "@/domain/spell/installer";
import { getSpellPriceList } from "@/domain/spell/pricing";
import { isSpellV1Enabled } from "@/lib/feature-flags";
import { getHomepageAccountHref } from "@/domain/services/homepage-routing";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary(await getLocale());
  return {
    title: { absolute: dict.spell.meta.title },
    description: dict.spell.meta.description,
    alternates: { canonical: "/spell" },
    openGraph: {
      title: dict.spell.meta.title,
      description: dict.spell.meta.description,
      type: "website",
      url: "/spell",
    },
  };
}

/**
 * TORE Spell — public product page. A SEPARATE commercial product (desktop
 * spelling checker) introduced by TORE.MN; this route hosts no app, no
 * checkout and no licence flow (none is available yet — the page says so).
 */
export default async function SpellPage() {
  const locale = await getLocale();
  const [dict, session] = await Promise.all([getDictionary(locale), getSessionUser()]);
  const authUser = session?.user
    ? {
        displayName: session.user.name?.trim() || session.user.email || dict.common.brand,
        dashboardHref: getHomepageAccountHref(session.user.role as UserRole | undefined),
      }
    : null;

  // Server-side configuration only: the browser never supplies a price.
  const labels = dict.spell.pricing.durations;
  const plans = getSpellPriceList().map((p, i) => ({ code: p.code, label: labels[i] ?? `${p.durationMonths}`, priceMnt: p.priceMnt }));
  const purchaseAvailable = isSpellV1Enabled() && isQpayConfigured();

  return <SpellLanding dict={dict} locale={locale} authUser={authUser} plans={plans} purchaseAvailable={purchaseAvailable} installerReady={getSpellInstallerUrl() !== null} />;
}
