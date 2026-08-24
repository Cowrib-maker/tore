import { AuthPageChrome } from "@/components/auth/auth-page-chrome";
import { EmailVerificationPanel } from "@/components/auth/email-verification-panel";
import { getEmailVerificationDeps } from "@/application/services/issue-verification-email";
import {
  invalidEmailVerificationPageModel,
  normalizeVerificationEmail,
  pendingEmailVerificationPageModel,
  successEmailVerificationPageModel,
  type EmailVerificationPageModel,
} from "@/application/services/email-verification-flow";
import { verifyEmailTokenUseCase } from "@/application/use-cases/auth/email-verification";
import { EmailVerificationLinkError } from "@/domain/errors/domain-error";
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
  const rawToken =
    typeof params.token === "string" ? params.token.trim() : "";
  const email = normalizeVerificationEmail(params.email);
  const callbackUrl = safeLegalAiCallback(
    typeof params.callbackUrl === "string" ? params.callbackUrl : null,
  );

  let model: EmailVerificationPageModel = pendingEmailVerificationPageModel(
    email,
    callbackUrl,
  );

  if (rawToken) {
    try {
      const result = await verifyEmailTokenUseCase(
        rawToken,
        getEmailVerificationDeps(),
      );
      model = successEmailVerificationPageModel(
        result.email,
        result.role,
        callbackUrl,
      );
    } catch (error) {
      if (!(error instanceof EmailVerificationLinkError)) {
        console.error("[email:verification] verify page failed", error);
      }
      model = invalidEmailVerificationPageModel(email);
    }
  }

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <EmailVerificationPanel copy={dict.auth} model={model} />
    </AuthPageChrome>
  );
}
