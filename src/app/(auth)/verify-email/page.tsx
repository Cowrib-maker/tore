import Link from "next/link";

import { AuthPageChrome } from "@/components/auth/auth-page-chrome";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getEmailVerificationDeps } from "@/application/services/issue-verification-email";
import { verifyEmailTokenUseCase } from "@/application/use-cases/auth/email-verification";
import { DomainError } from "@/domain/errors/domain-error";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";
import { cn } from "@/lib/utils";

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

  let status: "success" | "error" = "error";
  let message = dict.auth.verifyMissingToken;

  if (rawToken) {
    try {
      const result = await verifyEmailTokenUseCase(rawToken, getEmailVerificationDeps());
      status = "success";
      message = dict.auth.verifySuccess.replace("{email}", result.email);
    } catch (error) {
      console.error("[email:verification] verify page failed", error);
      status = "error";
      message =
        error instanceof DomainError
          ? error.message
          : dict.auth.verifyFailed;
    }
  }

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {status === "success"
              ? dict.auth.verifyTitleSuccess
              : dict.auth.verifyTitleError}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Link
            href="/login"
            className={cn(buttonVariants(), "w-full bg-[#0F3D33] text-white")}
          >
            {dict.auth.backToSignIn}
          </Link>
          {status === "error" && (
            <p className="text-center text-sm text-muted-foreground">
              {dict.auth.verifyResendHint}
            </p>
          )}
        </CardContent>
      </Card>
    </AuthPageChrome>
  );
}
