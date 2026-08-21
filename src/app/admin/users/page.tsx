import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminUsersList } from "@/application/actions/admin-users.actions";
import { AdminUserStatusButton } from "@/components/admin/admin-user-status-button";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserRole, UserStatus } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 25;

function statusBadgeVariant(
  status: UserStatus,
): "default" | "secondary" | "outline" {
  switch (status) {
    case UserStatus.ACTIVE:
      return "default";
    case UserStatus.SUSPENDED:
      return "secondary";
    default:
      return "outline";
  }
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSessionUser();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, params] = await Promise.all([
    getShellI18n("admin"),
    searchParams,
  ]);
  const m = i18n.dict.marketplace;
  const au = m.adminUsers;

  const search = typeof params.q === "string" ? params.q : "";
  const roleParam = typeof params.role === "string" ? params.role : "";
  const statusParam = typeof params.status === "string" ? params.status : "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const role = (Object.values(UserRole) as string[]).includes(roleParam)
    ? (roleParam as UserRole)
    : undefined;
  const status = (Object.values(UserStatus) as string[]).includes(
    statusParam,
  )
    ? (statusParam as UserStatus)
    : undefined;

  const { items, total } = await getAdminUsersList({
    search: search || undefined,
    role,
    status,
    page,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const roleLabel: Record<UserRole, string> = {
    [UserRole.CLIENT]: au.roleClient,
    [UserRole.LAWYER]: au.roleLawyer,
    [UserRole.ADMIN]: au.roleAdmin,
  };
  const statusLabel: Record<UserStatus, string> = {
    [UserStatus.ACTIVE]: au.statusActive,
    [UserStatus.SUSPENDED]: au.statusSuspended,
    [UserStatus.DEACTIVATED]: au.statusDeactivated,
  };

  function buildHref(next: Record<string, string>) {
    const merged = {
      q: search,
      role: roleParam,
      status: statusParam,
      page: String(page),
      ...next,
    };
    const qs = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => v),
    ).toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  }

  return (
    <>
      <DashboardPageHeading>{au.pageTitle}</DashboardPageHeading>

      <form className="mb-5 flex flex-wrap items-center gap-2" method="get">
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder={au.searchPlaceholder}
          className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
        />
        <select
          name="role"
          defaultValue={roleParam}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">{au.roleFilterAll}</option>
          <option value={UserRole.CLIENT}>{au.roleClient}</option>
          <option value={UserRole.LAWYER}>{au.roleLawyer}</option>
          <option value={UserRole.ADMIN}>{au.roleAdmin}</option>
        </select>
        <select
          name="status"
          defaultValue={statusParam}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">{au.statusFilterAll}</option>
          <option value={UserStatus.ACTIVE}>{au.statusActive}</option>
          <option value={UserStatus.SUSPENDED}>{au.statusSuspended}</option>
          <option value={UserStatus.DEACTIVATED}>
            {au.statusDeactivated}
          </option>
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          {au.filter}
        </button>
      </form>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {au.empty}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((user) => (
            <Card key={user.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {user.name || user.email}
                      {user.id === session.user.id ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({au.self})
                        </span>
                      ) : null}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{roleLabel[user.role]}</Badge>
                    <Badge variant={statusBadgeVariant(user.status)}>
                      {statusLabel[user.status]}
                    </Badge>
                    <Badge variant={user.emailVerified ? "default" : "secondary"}>
                      {user.emailVerified ? au.emailVerified : au.emailUnverified}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {au.joined} {user.createdAt.toISOString().slice(0, 10)}
                </p>
                {user.id !== session.user.id ? (
                  <AdminUserStatusButton
                    userId={user.id}
                    status={user.status}
                    suspendLabel={au.suspend}
                    activateLabel={au.activate}
                  />
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <a
            href={buildHref({ page: String(Math.max(1, page - 1)) })}
            className="text-primary underline-offset-4 hover:underline aria-disabled:pointer-events-none aria-disabled:text-muted-foreground aria-disabled:no-underline"
            aria-disabled={page <= 1}
          >
            {au.prev}
          </a>
          <span className="text-muted-foreground">
            {au.pageOf
              .replace("{current}", String(page))
              .replace("{total}", String(totalPages))}
          </span>
          <a
            href={buildHref({ page: String(Math.min(totalPages, page + 1)) })}
            className="text-primary underline-offset-4 hover:underline aria-disabled:pointer-events-none aria-disabled:text-muted-foreground aria-disabled:no-underline"
            aria-disabled={page >= totalPages}
          >
            {au.next}
          </a>
        </div>
      ) : null}
    </>
  );
}
