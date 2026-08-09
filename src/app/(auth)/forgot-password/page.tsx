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
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";
import { cn } from "@/lib/utils";

export default async function ForgotPasswordPage() {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);

  return (
    <AuthPageChrome locale={locale} dict={dict}>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{dict.auth.forgotTitle}</CardTitle>
          <CardDescription>{dict.auth.forgotDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <a
            href="mailto:support@tore.mn?subject=Password%20recovery"
            className={cn(buttonVariants(), "w-full")}
          >
            {dict.auth.sendReset}
          </a>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            {dict.auth.backToSignIn}
          </Link>
        </CardContent>
      </Card>
    </AuthPageChrome>
  );
}
