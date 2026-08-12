import { redirect } from "next/navigation";

import { getActiveContextSwitcherModel } from "@/application/common/active-context-switcher-model";
import { requireActor } from "@/application/common/require-actor";
import { getSessionUser } from "@/application/common/session";
import { ActiveContextSwitcher } from "@/components/organizations/active-context-switcher";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ActiveContextType } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";
import { isFoundationOrgsV1Enabled } from "@/lib/feature-flags";

export default async function OrganizationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isFoundationOrgsV1Enabled()) {
    try {
      const actor = await requireActor();
      redirect(getDashboardPath(actor.role));
    } catch {
      redirect("/login");
    }
  }

  const [actor, session, dict, locale] = await Promise.all([
    requireActor(),
    getSessionUser(),
    getDictionary(),
    getLocale(),
  ]);
  const o = dict.organizations;
  const switcher = await getActiveContextSwitcherModel(actor);

  const nav = [
    { href: getDashboardPath(actor.role), label: o.backToDashboard },
    { href: "/organizations", label: o.listTitle },
    { href: "/organizations/new", label: o.createTitle },
  ];

  return (
    <DashboardShell
      user={{
        name: session?.user?.name,
        email: session?.user?.email,
      }}
      nav={nav}
      locale={locale}
      languageLabel={dict.common.language}
      signOutLabel={dict.dashboard.signOut}
      brand={dict.common.brand}
      navAriaLabel={dict.marketplace.common.mainNav}
      mobileNavLabel={dict.marketplace.common.navigate}
    >
      {switcher.enabled ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2">
          <p className="text-sm text-muted-foreground">
            {dict.activeContext.label}
          </p>
          <ActiveContextSwitcher
            currentType={
              switcher.context?.contextType ?? ActiveContextType.PERSONAL
            }
            currentOrganizationId={switcher.context?.organizationId}
            personalAvailable={switcher.personalAvailable}
            organizations={switcher.organizations}
            copy={dict.activeContext}
          />
        </div>
      ) : null}
      {children}
    </DashboardShell>
  );
}
