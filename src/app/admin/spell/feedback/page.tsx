import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { listFeedbackGroups } from "@/application/use-cases/spell/feedback";
import { SpellFeedbackReview } from "@/components/admin/spell-feedback-review";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { SPELL_FEEDBACK_STATUSES, type SpellFeedbackStatus } from "@/domain/spell/feedback";
import { isSpellV1Enabled } from "@/lib/feature-flags";
import { getSpellRuntime } from "@/infrastructure/spell/spell-runtime";

export const dynamic = "force-dynamic";

const TYPE_MN: Record<string, string> = {
  WRONG_CORRECTION: "Зөв үгийг алдаатай гэсэн",
  MISSING_ERROR: "Алдаа илрээгүй",
  WRONG_SUGGESTION: "Санал болгосон засвар буруу",
  MISSING_WORD: "Шинэ үг санал болгосон",
  GENERAL: "Бусад",
};

/**
 * Smallest useful review view: one row per GROUP of identical reports with the real number of distinct users. A decision records a verdict about
 * the REPORT only; it never edits language data (accepted items go through native review and a tested data change).
 */
export default async function AdminSpellFeedbackPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await getSessionUser();
  if (!session?.user) redirect("/login");
  if (session.user.role !== UserRole.ADMIN) redirect(getDashboardPath(session.user.role as UserRole));
  const { status: raw } = await searchParams;
  const status = (SPELL_FEEDBACK_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as SpellFeedbackStatus) : "PENDING";

  const enabled = isSpellV1Enabled();
  const data = enabled
    ? await listFeedbackGroups({ userId: session.user.id, role: UserRole.ADMIN }, { status, limit: 100 }, { feedbackRepository: getSpellRuntime().feedbackRepository })
    : null;

  return (
    <>
      <DashboardPageHeading>TORE Spell · хэрэглэгчийн санал</DashboardPageHeading>
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/spell" className="underline">← Лицензүүд</Link>
        {SPELL_FEEDBACK_STATUSES.map((s) => (
          <Link key={s} href={`/admin/spell/feedback?status=${s}`} className={`rounded-full border px-3 py-1 ${s === status ? "bg-muted font-semibold" : ""}`}>{s}</Link>
        ))}
      </nav>
      <p className="mb-3 text-xs text-muted-foreground">
        Хэрэглэгчийн санал нь дохио болохоос хэлзүйн эрх зүйн эх сурвалж биш. «Зөвшөөрөх» нь тайланг хүлээн авсныг л тэмдэглэнэ — үгийн санг автоматаар өөрчлөхгүй.
      </p>
      {!data ? (
        <p className="text-sm text-muted-foreground">TORE_SPELL_V1 идэвхгүй.</p>
      ) : (
        <>
          {data.truncated ? <p className="mb-2 text-xs text-amber-700">Анхаар: хамгийн сүүлийн {data.rowsRead} тайлан л харагдаж байна.</p> : null}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>{["Үг", "Төрөл", "Хөдөлгүүр", "Хэрэглэгчийн санал", "Хэн / хэдэн", "Хувилбар", "Төлөв", "Шийдвэр"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.groups.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Санал алга.</td></tr>
                ) : (
                  data.groups.map((g) => (
                    <tr key={g.groupKey} className="border-t align-top">
                      <td className="px-3 py-2 font-semibold">{g.token || "—"}</td>
                      <td className="px-3 py-2">{TYPE_MN[g.feedbackType] ?? g.feedbackType}<br /><span className="font-mono text-xs text-muted-foreground">{g.reasonCode ?? ""}</span></td>
                      <td className="px-3 py-2">{g.engineSuggestion ?? "—"}</td>
                      <td className="px-3 py-2">{g.userSuggestion ?? "—"}{g.comments.length ? <p className="mt-1 text-xs text-muted-foreground">{g.comments.join(" | ")}</p> : null}</td>
                      <td className="px-3 py-2">{g.distinctUsers} хэрэглэгч<br /><span className="text-xs text-muted-foreground">{g.reports} тайлан</span></td>
                      <td className="px-3 py-2 font-mono text-xs">{g.engineVersions.join(", ")}<br />{g.dataVersions.join(", ").slice(0, 40)}</td>
                      <td className="px-3 py-2 text-xs">{Object.entries(g.statuses).map(([k, v]) => `${k}: ${v}`).join(", ")}{g.reviewReason ? <p className="mt-1 text-muted-foreground">{g.reviewReason}</p> : null}</td>
                      <td className="px-3 py-2 min-w-56">{g.statuses.PENDING || g.statuses.NEEDS_NATIVE_REVIEW ? <SpellFeedbackReview groupKey={g.groupKey} /> : <span className="text-xs text-muted-foreground">Шийдвэрлэсэн</span>}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
