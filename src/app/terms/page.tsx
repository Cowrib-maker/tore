import type { Metadata } from "next";
import Link from "next/link";

import { AuthPageChrome } from "@/components/auth/auth-page-chrome";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "TORE marketplace and Legal AI terms of service.",
};

export default async function TermsOfServicePage() {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = dict.legal;

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{copy.termsTitle}</CardTitle>
          <CardDescription>{copy.placeholderBanner}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>{copy.termsIntro}</p>
          <p>{copy.termsScope}</p>
          <p>{copy.termsAccounts}</p>
          <p>{copy.termsMarketplace}</p>
          <p>{copy.termsLegalAi}</p>
          <p>{copy.termsContact}</p>
          <p className="pt-2">
            <Link
              href="/privacy"
              className="text-primary underline-offset-4 hover:underline"
            >
              {copy.privacyLink}
            </Link>
            {" · "}
            <Link
              href="/register/client"
              className="text-primary underline-offset-4 hover:underline"
            >
              {dict.auth.registerClientLink}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthPageChrome>
  );
}
