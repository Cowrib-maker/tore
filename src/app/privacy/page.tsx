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
  title: "Privacy Policy",
  description: "TORE privacy policy (draft placeholder).",
};

export default async function PrivacyPolicyPage() {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = dict.legal;

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{copy.privacyTitle}</CardTitle>
          <CardDescription>{copy.placeholderBanner}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>{copy.privacyIntro}</p>
          <p>{copy.privacyData}</p>
          <p>{copy.privacyUse}</p>
          <p>{copy.privacyRetention}</p>
          <p>{copy.privacyContact}</p>
          <p className="pt-2">
            <Link
              href="/terms"
              className="text-primary underline-offset-4 hover:underline"
            >
              {copy.termsLink}
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
