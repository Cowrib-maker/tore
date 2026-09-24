import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  FileText,
  Home,
  Scale,
  Search,
  Users,
  Users2,
  Wallet,
} from "lucide-react";

import { getMyOrganizationOverviewForSession } from "@/application/actions/organization.actions";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import {
  WorkspaceSideNav,
  type WorkspaceSideNavItem,
} from "@/components/workspace/workspace-side-nav";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { NotFoundError } from "@/domain/errors/domain-error";
import {
  OrganizationRole,
  OrganizationStatus,
  OrganizationType,
} from "@/domain/enums";
import { getDictionary } from "@/i18n/get-dictionary";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

function typeLabel(type: OrganizationType, copy: Dictionary["organizations"]) {
  return type === OrganizationType.LAW_FIRM
    ? copy.typeLawFirm
    : copy.typeLegalEntity;
}

function roleLabel(role: OrganizationRole, copy: Dictionary["organizations"]) {
  if (role === OrganizationRole.OWNER) return copy.roleOwner;
  if (role === OrganizationRole.ADMIN) return copy.roleAdmin;
  return copy.roleMember;
}

function statusLabel(
  status: OrganizationStatus,
  copy: Dictionary["organizations"],
) {
  if (status === OrganizationStatus.ACTIVE) return copy.statusActive;
  if (status === OrganizationStatus.SUSPENDED) return copy.statusSuspended;
  return copy.statusDeactivated;
}

/**
 * Sidebar nav mirrors the approved Firm/Team reference's left nav list.
 * Only "Тойм" (this page) is a real, working destination — none of the
 * other modules have a backend yet (no case/document/client/billing
 * scoped to an organization exists), so they render as inert
 * "coming soon" rows rather than links, per the same pattern already
 * used for the module tiles below.
 */
function workspaceNavItems(
  copy: Dictionary["organizations"],
  organizationId: string,
): WorkspaceSideNavItem[] {
  return [
    {
      key: "overview",
      icon: Home,
      label: copy.workspaceOverview,
      href: `/organizations/${organizationId}`,
      active: true,
    },
    { key: "cases", icon: Briefcase, label: copy.moduleCases, comingSoonLabel: copy.comingSoonTag },
    { key: "clients", icon: Users, label: copy.moduleClients, comingSoonLabel: copy.comingSoonTag },
    { key: "documents", icon: FileText, label: copy.moduleDocuments, comingSoonLabel: copy.comingSoonTag },
    { key: "research", icon: Search, label: copy.moduleResearch, comingSoonLabel: copy.comingSoonTag },
    { key: "court", icon: Scale, label: copy.moduleCourtPractice, comingSoonLabel: copy.comingSoonTag },
    { key: "team", icon: Users2, label: copy.moduleTeam, comingSoonLabel: copy.comingSoonTag },
    { key: "knowledge", icon: BookOpen, label: copy.moduleKnowledge, comingSoonLabel: copy.comingSoonTag },
    { key: "billing", icon: Wallet, label: copy.moduleBilling, comingSoonLabel: copy.comingSoonTag },
    { key: "reports", icon: BarChart3, label: copy.moduleReports, comingSoonLabel: copy.comingSoonTag },
  ];
}

export default async function OrganizationOverviewPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const dict = await getDictionary();
  const copy = dict.organizations;

  let view;
  try {
    view = await getMyOrganizationOverviewForSession(organizationId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const { organization, membership } = view;
  const isFirm = organization.type === OrganizationType.LAW_FIRM;
  const tagline = isFirm ? copy.firmTagline : copy.teamTagline;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
        <DashboardPageHeading>{organization.name}</DashboardPageHeading>
        <Link
          href="/organizations"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          {copy.backToList}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[272px_1fr]">
        <WorkspaceSideNav
          icon={isFirm ? Building2 : Users2}
          title={isFirm ? "TORE Firm" : "TORE Team"}
          subtitle={organization.name}
          items={workspaceNavItems(copy, organization.id)}
        />

        <div>
          {/* Hero — same navy "premium legal workspace" identity as the
              Legal AI surface, reused here for the Firm/Team workspace. */}
          <div className="mb-6 rounded-2xl bg-[#0B1F3A] px-6 py-7 text-white sm:px-8 sm:py-8">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-white/60 uppercase">
              {isFirm ? "TORE FIRM" : "TORE TEAM"}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              {organization.name}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
              {tagline}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-white/20 text-white">
                {typeLabel(organization.type, copy)}
              </Badge>
              <Badge variant="outline" className="border-white/20 text-white">
                {roleLabel(membership.orgRole, copy)}
              </Badge>
              <Badge variant="outline" className="border-white/20 text-white">
                {statusLabel(organization.status, copy)}
              </Badge>
            </div>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{copy.overviewTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {copy.fieldType}
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {typeLabel(organization.type, copy)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {copy.fieldRole}
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {roleLabel(membership.orgRole, copy)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {copy.fieldStatus}
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {statusLabel(organization.status, copy)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {copy.fieldCreated}
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {organization.createdAt.toISOString().slice(0, 10)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <EmptyState
              title={copy.emptyCasesTitle}
              description={copy.emptyCasesHint}
            />
            <EmptyState title={copy.emptyTeamTitle} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <EmptyState
              title={copy.emptyBillingTitle}
              description={copy.emptyBillingHint}
            />
            <EmptyState title={copy.emptyReportsTitle} />
          </div>
        </div>
      </div>
    </>
  );
}
