import { AuthPageChrome } from "@/components/auth/auth-page-chrome";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export default async function ForgotPasswordPage() {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <ForgotPasswordForm copy={dict.auth} />
    </AuthPageChrome>
  );
}
