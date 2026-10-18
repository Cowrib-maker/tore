import { notFound } from "next/navigation";

import { creatableOrganizationTypesForRole } from "@/domain/services/organization-create-types";
import { requireActor } from "@/application/common/require-actor";
import { CreateOrganizationForm } from "@/components/organizations/create-organization-form";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDictionary } from "@/i18n/get-dictionary";
import { isFoundationOrgsV1Enabled } from "@/lib/feature-flags";

export default async function NewOrganizationPage() {
  // Feature flag off: the layout redirects, but the page is not guaranteed to be gated by that redirect (production logged an
  // uncaught ForbiddenError from /organizations.rsc). Never reach the flag-guarded use cases; answer 404 instead of a 500.
  if (!isFoundationOrgsV1Enabled()) notFound();
  const [actor, dict] = await Promise.all([requireActor(), getDictionary()]);
  const copy = dict.organizations;
  const allowedTypes = creatableOrganizationTypesForRole(actor.role);

  return (
    <>
      <DashboardPageHeading>{copy.createTitle}</DashboardPageHeading>
      <Card>
        <CardHeader>
          <CardTitle>{copy.createTitle}</CardTitle>
          <CardDescription>{copy.createDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrganizationForm allowedTypes={allowedTypes} copy={copy} />
        </CardContent>
      </Card>
    </>
  );
}
