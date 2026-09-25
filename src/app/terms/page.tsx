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
  const doc = copy.termsDocument;

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <Card className="w-full max-w-3xl">
        <CardHeader className="space-y-1.5">
          <CardTitle>{copy.termsTitle}</CardTitle>
          <CardDescription>{doc.effectiveDate}</CardDescription>
          <CardDescription>{doc.disclaimer}</CardDescription>
          <CardDescription>{copy.legalEntityNotice}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          {doc.chapters.map((chapter, chapterIndex) => (
            <section key={chapterIndex} className="space-y-4">
              <h2 className="text-base font-semibold text-foreground">
                {chapter.title}
              </h2>
              {chapter.sections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="space-y-2">
                  <h3 className="font-medium text-foreground">
                    {section.heading}
                  </h3>
                  <ul className="list-none space-y-2">
                    {section.clauses.map((clause, clauseIndex) => (
                      <li key={clauseIndex}>{clause}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
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
