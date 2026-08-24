import { requireActor } from "@/application/common/require-actor";
import { loadLawyerWorkspaceHome } from "@/application/use-cases/case-review";
import { productionCaseAiDeps } from "@/application/use-cases/case-review/prod-wiring";
import { LawyerWorkspaceHome } from "@/components/case-review/lawyer-workspace-home";
import { UserRole } from "@/domain/enums";

export default async function LawyerWorkspacePage() {
  const actor = await requireActor(UserRole.LAWYER);
  const view = await loadLawyerWorkspaceHome(actor, productionCaseAiDeps());
  return <LawyerWorkspaceHome view={view} />;
}
