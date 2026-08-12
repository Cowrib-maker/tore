import Link from "next/link";
import { notFound } from "next/navigation";

import { getMyOrganizationOverviewForSession } from "@/application/actions/organization.actions";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

      <Card>
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
    </>
  );
}
