import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminDevConsoleData } from "@/application/actions/admin-devtools.actions";
import { getSessionUser } from "@/application/common/session";
import {
  AdminDevBulkApproveButton,
  AdminDevUserActions,
} from "@/components/admin/admin-dev-user-actions";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { ADMIN_DEVTOOLS_V1_FLAG } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";

export default async function AdminDevConsolePage() {
  const session = await getSessionUser();
  if (!session?.user) redirect("/login");
  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const data = await getAdminDevConsoleData();

  if (data.status === "disabled") {
    return (
      <>
        <DashboardPageHeading>Developer tools</DashboardPageHeading>
        <Card>
          <CardHeader>
            <CardTitle>Disabled</CardTitle>
            <CardDescription>
              Set{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {ADMIN_DEVTOOLS_V1_FLAG}=1
              </code>{" "}
              in a non-production environment, then restart the server. This
              console is hard-disabled when{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                NODE_ENV=production
              </code>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/dashboard"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Back to admin
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  if (data.status === "unauthenticated") redirect("/login");
  if (data.status === "forbidden") {
    redirect(getDashboardPath(UserRole.ADMIN));
  }

  return (
    <>
      <DashboardPageHeading>Developer tools</DashboardPageHeading>
      <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
        Local-only admin console for end-to-end marketplace testing without
        switching accounts. Never available in production. Actions are audited
        with <code className="text-xs">adminDevtools: true</code>.
      </p>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Bulk verification</CardTitle>
          <CardDescription>
            Approve every SUBMITTED credential in the review queue (same rules
            as /admin/lawyers).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <AdminDevBulkApproveButton pendingCount={data.pendingCount} />
          <Link
            href="/admin/lawyers"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Open credential queue
          </Link>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {data.rows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              No client or lawyer users yet. Register accounts, then return here.
            </CardContent>
          </Card>
        ) : (
          data.rows.map((row) => (
            <Card key={row.user.id}>
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {row.user.name ?? "Unnamed"} · {row.user.email}
                    </CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap gap-2">
                      <Badge variant="outline">{row.user.role}</Badge>
                      <Badge
                        variant={row.emailVerified ? "default" : "secondary"}
                      >
                        email {row.emailVerified ? "verified" : "unverified"}
                      </Badge>
                      {row.lawyerProfile ? (
                        <>
                          <Badge
                            variant={
                              row.lawyerProfile.verificationStatus ===
                              "APPROVED"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {row.lawyerProfile.verificationStatus}
                          </Badge>
                          <Badge
                            variant={
                              row.lawyerProfile.isListed
                                ? "default"
                                : "outline"
                            }
                          >
                            {row.lawyerProfile.isListed
                              ? "listed"
                              : "unlisted"}
                          </Badge>
                          <Badge variant="outline">
                            {row.activeOfferingCount} active offering
                            {row.activeOfferingCount === 1 ? "" : "s"}
                          </Badge>
                          {row.directoryReady ? (
                            <Badge>directory-ready</Badge>
                          ) : (
                            <Badge variant="destructive">
                              blocked: {row.blockers.join(", ")}
                            </Badge>
                          )}
                        </>
                      ) : null}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <AdminDevUserActions
                  userId={row.user.id}
                  role={row.user.role}
                  emailVerified={row.emailVerified}
                  isListed={row.lawyerProfile?.isListed ?? null}
                  verificationStatus={
                    row.lawyerProfile?.verificationStatus ?? null
                  }
                  directoryReady={row.directoryReady}
                />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
