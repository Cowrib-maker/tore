import { AuthPageChrome } from "@/components/auth/auth-page-chrome";
import { EmailVerificationPanel } from "@/components/auth/email-verification-panel";
import {
  normalizeVerificationEmail,
  pendingEmailVerificationPageModel,
} from "@/application/services/email-verification-flow";
import { safeLegalAiCallback } from "@/domain/services/rbac";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [dict, locale, params] = await Promise.all([
    getDictionary(),
    getLocale(),
    searchParams,
  ]);
  const email = normalizeVerificationEmail(params.email);
  const callbackUrl = safeLegalAiCallback(
    typeof params.callbackUrl === "string" ? params.callbackUrl : null,
  );
  const sent = params.sent === "1";
  const fromUnverifiedLogin = params.unverified === "1";

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <EmailVerificationPanel
        copy={dict.auth}
        model={pendingEmailVerificationPageModel(
          email,
          callbackUrl,
          sent,
          fromUnverifiedLogin,
        )}
      />
    </AuthPageChrome>
  );
}
