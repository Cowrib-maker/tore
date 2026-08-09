import { AuthPageChrome } from "@/components/auth/auth-page-chrome";
import { LoginForm } from "@/components/auth/login-form";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export default async function LoginPage() {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <LoginForm copy={dict.auth} />
    </AuthPageChrome>
  );
}
