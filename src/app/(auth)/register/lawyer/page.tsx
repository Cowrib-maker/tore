import { AuthPageChrome } from "@/components/auth/auth-page-chrome";
import { RegisterLawyerForm } from "@/components/auth/register-lawyer-form";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export default async function RegisterLawyerPage() {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <RegisterLawyerForm copy={dict.auth} locale={locale} />
    </AuthPageChrome>
  );
}
