import Link from "next/link";

import { requireAdminPage } from "@/application/common/require-admin-page";
import { getPreviewOverridesUseCase } from "@/application/use-cases/site-content/manage-site-content";
import { PreviewFrame } from "@/components/admin/preview/preview-frame";
import { LegalAiAccessGateCard } from "@/components/legal-ai/legal-ai-access-gate";
import { LandingPage } from "@/components/marketing/landing-page";
import { StudentHubView } from "@/components/student/student-hub-view";
import { getGatePreview, getHomePreviewProps, resolvePreview } from "@/domain/admin-preview/scenarios";
import { applySiteContentOverrides } from "@/domain/site-content/registry";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";
import { siteContentRepository } from "@/infrastructure/repositories";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ page: string }>;
  searchParams: Promise<{ context?: string; locale?: string; content?: string }>;
}) {
  const actor = await requireAdminPage();
  const [{ page }, query] = await Promise.all([params, searchParams]);
  const resolved = resolvePreview({ page, ...query });

  if (!resolved.ok) {
    return (
      <div className="space-y-3 p-4" role="alert">
        <h1 className="text-lg font-semibold">Энэ урьдчилсан харагдацыг дэмжихгүй байна</h1>
        <p>{resolved.reason}</p>
        <Link href="/admin/preview" className="underline">← Урьдчилан харах хэсэг рүү</Link>
      </div>
    );
  }

  const dictionary = getDictionarySync(resolved.locale);
  const overrides = await getPreviewOverridesUseCase(actor, resolved.locale, resolved.content, { siteContentRepository });
  const dict = applySiteContentOverrides(dictionary, overrides);
  const gate = resolved.page === "legal-ai-gate" ? getGatePreview(resolved.context) : null;

  return (
    <PreviewFrame page={resolved.page} context={resolved.context} locale={resolved.locale} content={resolved.content}>
      {resolved.page === "home" ? (
        <LandingPage dict={dict} locale={resolved.locale} {...getHomePreviewProps(resolved.context, dict.common.brand)} />
      ) : resolved.page === "student" ? (
        <StudentHubView dict={dict} locale={resolved.locale} authUser={getHomePreviewProps(resolved.context, dict.common.brand).authUser} />
      ) : gate ? (
        <div className="mx-auto max-w-xl p-6">
          <LegalAiAccessGateCard gate={gate} />
        </div>
      ) : (
        <p className="p-6">Энэ төлөвт хаалт байхгүй: хэрэглэгч Хууль зүйн AI-г хязгааргүй ашиглана (жишээ төлөв).</p>
      )}
    </PreviewFrame>
  );
}
