import type { ActorContext } from "@/application/common/actor-context";
import {
  lawyerEntitlementDeps,
  persistDeviceSessionCookie,
  readLawyerSessionHttpContext,
} from "@/application/common/lawyer-session-http";
import {
  assertLawyerAiOperation,
  consumeLawyerFeatureUsage,
  type LawyerAiGuardResult,
} from "@/application/use-cases/entitlements/assert-lawyer-ai-operation";
import { loadSessionProtectionPolicy } from "@/application/use-cases/entitlements/get-lawyer-billing-snapshot";
import { EntitlementFeature } from "@/domain/enums";

export async function guardLawyerAiHttp(
  actor: ActorContext,
  feature: EntitlementFeature,
): Promise<LawyerAiGuardResult> {
  const ctx = await readLawyerSessionHttpContext();
  const deps = lawyerEntitlementDeps();
  const policy = await loadSessionProtectionPolicy(deps.platformSettingRepository);
  const result = await assertLawyerAiOperation(
    {
      actor,
      sessionIdFromCookie: ctx.sessionIdFromCookie,
      userAgent: ctx.userAgent,
      ipHash: ctx.ipHash,
      policy,
      feature,
    },
    deps,
  );
  await persistDeviceSessionCookie(result.session.id);
  return result;
}

export async function recordLawyerFeatureUsage(
  usageId: string,
  feature: EntitlementFeature,
  tokens?: { inputTokens?: number; outputTokens?: number },
): Promise<void> {
  await consumeLawyerFeatureUsage(usageId, feature, lawyerEntitlementDeps(), tokens);
}
