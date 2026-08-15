import { AuthPageChrome } from "@/components/auth/auth-page-chrome";
import { RegisterClientForm } from "@/components/auth/register-client-form";
import { safeLegalAiCallback } from "@/domain/services/rbac";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export default async function RegisterClientPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [dict, locale, params] = await Promise.all([
    getDictionary(),
    getLocale(),
    searchParams,
  ]);
  const callbackUrl = safeLegalAiCallback(
    typeof params.callbackUrl === "string" ? params.callbackUrl : null,
  );

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <RegisterClientForm
        copy={dict.auth}
        locale={locale}
        callbackUrl={callbackUrl}
      />
    </AuthPageChrome>
  );
}
