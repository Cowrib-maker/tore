import { cache } from "react";
import { cookies } from "next/headers";

import { ACTIVE_CONTEXT_COOKIE } from "@/application/common/active-context-cookie";
import { parseActiveContextSelection } from "@/application/common/active-context-selection";
import type { ActiveContext } from "@/application/common/actor-context";
import { requireActor } from "@/application/common/require-actor";
import { resolveCurrentActiveContextUseCase } from "@/application/use-cases/active-context/switch-active-context";
import type { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import {
  organizationRepository,
  tenantRepository,
} from "@/infrastructure/repositories";
import { isFoundationActiveContextV1Enabled } from "@/lib/feature-flags";

const activeContextDeps = {
  tenantRepository,
  organizationRepository,
};

/**
 * Require tenant-aware Active Context for future Matter/Workspace/AI paths.
 * Additive — does not replace requireActor() for marketplace.
 *
 * Session/JWT decision: selection hint may live in an HttpOnly cookie;
 * tenantId / membershipId / orgRole are always resolved from the database.
 * Stale org selection falls back to PERSONAL without trusting cookie claims.
 */
export async function requireActiveContext(
  role?: UserRole,
): Promise<ActiveContext> {
  if (!isFoundationActiveContextV1Enabled()) {
    throw new ForbiddenError(
      "Active Context is disabled (TORE_FOUNDATION_ACTIVE_CONTEXT_V1)",
    );
  }

  const actor = await requireActor(role);
  return loadActiveContextForActor(actor.userId, actor);
}

const loadActiveContextForActor = cache(
  async (
    _cacheKey: string,
    actor: { userId: string; role: UserRole },
  ): Promise<ActiveContext> => {
    const store = await cookies();
    const selection = parseActiveContextSelection(
      store.get(ACTIVE_CONTEXT_COOKIE)?.value,
    );

    const result = await resolveCurrentActiveContextUseCase(
      { actor, selection },
      activeContextDeps,
    );
    return result.context;
  },
);
