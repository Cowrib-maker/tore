import { AuthPageChrome } from "@/components/auth/auth-page-chrome";
import { RegisterClientForm } from "@/components/auth/register-client-form";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export default async function RegisterClientPage() {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <RegisterClientForm copy={dict.auth} locale={locale} />
    </AuthPageChrome>
  );
}
