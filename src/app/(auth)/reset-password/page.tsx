import { AuthPageChrome } from "@/components/auth/auth-page-chrome";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { assertPasswordResetTokenValid } from "@/application/use-cases/auth/password-reset";
import { emailVerificationTokenRepository } from "@/infrastructure/repositories";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

type SearchParams = Promise<{ token?: string }>;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [dict, locale, params] = await Promise.all([
    getDictionary(),
    getLocale(),
    searchParams,
  ]);

  const token = typeof params.token === "string" ? params.token : "";
  let tokenValid = false;
  if (token) {
    const result = await assertPasswordResetTokenValid(token, {
      emailVerificationTokenRepository,
    });
    tokenValid = result.valid;
  }

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <ResetPasswordForm
        copy={dict.auth}
        token={token}
        tokenValid={tokenValid}
      />
    </AuthPageChrome>
  );
}
