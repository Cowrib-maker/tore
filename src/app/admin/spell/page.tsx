import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { PaymentCenterTabs } from "@/components/admin/payment-center-tabs";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { deriveLicenseState } from "@/domain/spell/license-state";
import { maskedLicenseCode } from "@/domain/spell/license-code";
import { isSpellV1Enabled } from "@/lib/feature-flags";
import { userRepository } from "@/infrastructure/repositories";
import { invoiceRepository } from "@/infrastructure/repositories/prisma-invoice-repository";
import { getSpellRuntime } from "@/infrastructure/spell/spell-runtime";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—");

/** Minimum admin visibility: who bought which TORE Spell licence, its status and its payment reference. */
export default async function AdminSpellPage() {
  const session = await getSessionUser();
  if (!session?.user) redirect("/login");
  if (session.user.role !== UserRole.ADMIN) redirect(getDashboardPath(session.user.role as UserRole));

  const enabled = isSpellV1Enabled();
  const rows = enabled
    ? await (async () => {
        const runtime = getSpellRuntime();
        const { items } = await runtime.deps.repos.licenseRepository.list({ limit: 100, offset: 0 });
        const now = new Date();
        return Promise.all(
          items.map(async (l) => {
            const [owner, invoice] = await Promise.all([
              l.ownerUserId ? userRepository.findById(l.ownerUserId) : null,
              l.purchaseInvoiceId ? invoiceRepository.findById(l.purchaseInvoiceId) : null,
            ]);
            return {
              id: l.id,
              user: owner?.email ?? "—",
              code: maskedLicenseCode(l.codeHint),
              months: l.durationMonths,
              source: l.source,
              status: deriveLicenseState(l, now).status,
              createdAt: l.createdAt,
              expiresAt: l.expiresAt,
              payment: invoice ? `${invoice.id}${invoice.providerInvoiceId ? ` · QPay ${invoice.providerInvoiceId}` : ""}` : "—",
            };
          }),
        );
      })()
    : [];

  return (
    <>
      <DashboardPageHeading>TORE Spell лицензүүд</DashboardPageHeading>
      <PaymentCenterTabs active="/admin/spell" />
      {!enabled ? (
        <p className="text-sm text-muted-foreground">TORE_SPELL_V1 идэвхгүй тул лиценз харагдахгүй.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                {["Хэрэглэгч", "Лиценз", "Хугацаа", "Төлөв", "Үүссэн", "Дуусах", "Төлбөрийн лавлагаа"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Лиценз алга.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.user}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.code}<br /><span className="text-muted-foreground">{r.id.slice(0, 8)}</span></td>
                    <td className="px-3 py-2">{r.months} сар · {r.source}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{fmt(r.createdAt)}</td>
                    <td className="px-3 py-2">{fmt(r.expiresAt)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.payment}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
