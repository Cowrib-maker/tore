import { cookies } from "next/headers";

import { parseActiveContextSelection } from "@/application/common/active-context-selection";
import { ACTIVE_CONTEXT_COOKIE } from "@/application/common/active-context-cookie";
import type { ActiveContext } from "@/application/common/actor-context";
import type { ActorContext } from "@/application/common/actor-context";
import { resolveCurrentActiveContextUseCase } from "@/application/use-cases/active-context/switch-active-context";
import { listMyOrganizationsUseCase } from "@/application/use-cases/organizations/list-my-organizations";
import { ActiveContextType } from "@/domain/enums";
import {
  organizationRepository,
  tenantRepository,
} from "@/infrastructure/repositories";
import {
  isFoundationActiveContextV1Enabled,
  isFoundationOrgsV1Enabled,
} from "@/lib/feature-flags";

const deps = {
  tenantRepository,
  organizationRepository,
};

export type ActiveContextSwitcherModel = {
  enabled: boolean;
  context: ActiveContext | null;
  personalAvailable: boolean;
  organizations: Array<{ id: string; name: string }>;
};

/**
 * Load switcher model for authenticated actors.
 * Never lists organizations outside the actor's ACTIVE memberships.
 */
export async function getActiveContextSwitcherModel(
  actor: ActorContext,
): Promise<ActiveContextSwitcherModel> {
  if (!isFoundationActiveContextV1Enabled()) {
    return {
      enabled: false,
      context: null,
      personalAvailable: false,
      organizations: [],
    };
  }

  const personal = await tenantRepository.findPersonalTenantForUser(
    actor.userId,
  );
  const personalAvailable = personal != null;

  let organizations: Array<{ id: string; name: string }> = [];
  if (isFoundationOrgsV1Enabled()) {
    try {
      const memberships = await listMyOrganizationsUseCase(actor, {
        organizationRepository,
      });
      organizations = memberships.map((row) => ({
        id: row.organization.id,
        name: row.organization.name,
      }));
    } catch {
      organizations = [];
    }
  }

  const store = await cookies();
  const selection = parseActiveContextSelection(
    store.get(ACTIVE_CONTEXT_COOKIE)?.value,
  );

  let context: ActiveContext | null = null;
  try {
    const result = await resolveCurrentActiveContextUseCase(
      { actor, selection },
      deps,
    );
    context = result.context;
  } catch {
    // Personal tenant may be missing — switcher still lists orgs if any.
    context = null;
  }

  return {
    enabled: true,
    context,
    personalAvailable,
    organizations,
  };
}

export function activeContextTypeOrPersonal(
  context: ActiveContext | null,
): ActiveContextType {
  return context?.contextType ?? ActiveContextType.PERSONAL;
}
