import { LandingPage } from "@/components/marketing/landing-page";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export default async function HomePage() {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);
  return <LandingPage dict={dict} locale={locale} />;
}
