import Link from "next/link";

import { getMyOrganizationsForSession } from "@/application/actions/organization.actions";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default async function OrganizationsPage() {
  const [dict, items] = await Promise.all([
    getDictionary(),
    getMyOrganizationsForSession(),
  ]);
  const copy = dict.organizations;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
        <DashboardPageHeading>{copy.listTitle}</DashboardPageHeading>
        <Link href="/organizations/new" className={cn(buttonVariants())}>
          {copy.createTitle}
        </Link>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{copy.title}</CardTitle>
            <CardDescription>{copy.listEmpty}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/organizations/new" className={cn(buttonVariants())}>
              {copy.listEmptyCta}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map(({ organization, membership }) => (
            <li key={organization.id}>
              <Link
                href={`/organizations/${organization.id}`}
                className="block rounded-xl border px-4 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold tracking-tight">
                      {organization.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {typeLabel(organization.type, copy)} ·{" "}
                      {roleLabel(membership.orgRole, copy)} ·{" "}
                      {statusLabel(organization.status, copy)}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
