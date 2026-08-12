import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { getSessionUser } from "@/application/common/session";
import { isAdminDevtoolsEnabled } from "@/lib/feature-flags";

/** Shows only while admin-devtools impersonation JWT claim is present. */
export async function ImpersonationBannerHost() {
  if (!isAdminDevtoolsEnabled()) return null;

  const session = await getSessionUser();
  if (!session?.user?.impersonatorId) return null;

  return (
    <ImpersonationBanner
      email={session.user.email}
      role={session.user.role}
    />
  );
}
