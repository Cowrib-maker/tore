import { assertUserEmailVerified } from "@/application/common/assert-email-verified";
import { loadActorUser } from "@/application/common/require-actor";
import { isPlatformDemoEmail } from "@/domain/constants/platform-demo-accounts";

/**
 * Privileged-action gate. Do not fold into requireActor() — login, GET billing,
 * GET sessions, resend verification, and password reset must remain available.
 */
export async function assertEmailVerified(userId: string): Promise<void> {
  const record = await loadActorUser(userId);
  if (isPlatformDemoEmail(record?.email)) {
    return;
  }
  assertUserEmailVerified(record);
}
