import { AuthPageChrome } from "@/components/auth/auth-page-chrome";
import { LoginForm } from "@/components/auth/login-form";
import { lookupAuthSession } from "@/application/common/session";
import { safeLegalAiCallback } from "@/domain/services/rbac";
import { isSessionReplacedLoginReason } from "@/domain/services/active-session";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [dict, locale, params] = await Promise.all([
    getDictionary(),
    getLocale(),
    searchParams,
  ]);
  await lookupAuthSession();
  const callbackUrl = safeLegalAiCallback(
    typeof params.callbackUrl === "string" ? params.callbackUrl : null,
  );
  const sessionReplaced = isSessionReplacedLoginReason(
    typeof params.reason === "string" ? params.reason : null,
  );

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <LoginForm
        copy={dict.auth}
        callbackUrl={callbackUrl}
        sessionReplaced={sessionReplaced}
      />
    </AuthPageChrome>
  );
}
