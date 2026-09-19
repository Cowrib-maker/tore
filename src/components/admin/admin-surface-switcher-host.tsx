import { getSessionUser } from "@/application/common/session";
import { AdminSurfaceSwitcher } from "@/components/admin/admin-surface-switcher";
import { UserRole } from "@/domain/enums";

/** Shows only for an ADMIN session. Same pattern as ImpersonationBannerHost. */
export async function AdminSurfaceSwitcherHost() {
  const session = await getSessionUser();
  if (session?.user?.role !== UserRole.ADMIN) return null;

  return <AdminSurfaceSwitcher />;
}
