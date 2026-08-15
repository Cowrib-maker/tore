import Link from "next/link";

import { getSessionUser } from "@/application/common/session";
import { BRAND_LOGO_SHELL } from "@/components/brand/tokens";
import { LegalAiChat } from "@/components/legal-ai/legal-ai-chat";
import { BrandLink } from "@/components/layout/brand-link";
import { buttonVariants } from "@/components/ui/button";
import { UserRole } from "@/domain/enums";
import {
  getDashboardPath,
  loginHrefForLegalAi,
  registerClientHrefForLegalAi,
} from "@/domain/services/rbac";
import { getDictionary } from "@/i18n/get-dictionary";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LegalAiPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [dict, session, params] = await Promise.all([
    getDictionary(),
    getSessionUser(),
    searchParams,
  ]);
  const initialQuestion = typeof params.q === "string" ? params.q : "";
  const dashboardHref =
    session?.user?.role && session.user.role in UserRole
      ? getDashboardPath(session.user.role as UserRole)
      : null;

  return (
    <div className="min-h-screen bg-[#F4F7FA]">
      <header className="border-b border-[#0B1F3A]/8 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_SHELL} />
          <div className="flex items-center gap-3 text-sm">
            {dashboardHref ? (
              <Link href={dashboardHref} className={buttonVariants({ size: "sm" })}>
                {session?.user?.name?.trim() ||
                  session?.user?.email ||
                  dict.dashboard.navDashboard}
              </Link>
            ) : (
              <>
                <Link
                  href={loginHrefForLegalAi()}
                  className="cursor-pointer text-[#5C6570] hover:text-[#0B1F3A]"
                >
                  {dict.common.signIn}
                </Link>
                <Link
                  href={registerClientHrefForLegalAi()}
                  className={buttonVariants({ size: "sm" })}
                >
                  {dict.common.getStarted}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="px-4 py-10 sm:px-6 lg:px-8">
        <LegalAiChat initialQuestion={initialQuestion} />
      </main>
    </div>
  );
}
