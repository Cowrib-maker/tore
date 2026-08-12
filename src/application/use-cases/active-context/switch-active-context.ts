import type {
  ActiveContext,
  ActiveContextSelection,
  ActorContext,
} from "@/application/common/actor-context";
import {
  resolveOrganizationActiveContextUseCase,
  resolvePersonalActiveContextUseCase,
  type ActiveContextDeps,
} from "@/application/use-cases/active-context/resolve-active-context";
import { ActiveContextType } from "@/domain/enums";
import { ForbiddenError, NotFoundError } from "@/domain/errors/domain-error";
import { isFoundationActiveContextV1Enabled } from "@/lib/feature-flags";

export type ResolveCurrentActiveContextInput = {
  actor: ActorContext;
  /** Parsed cookie/UI selection hint; null → PERSONAL default. */
  selection: ActiveContextSelection | null;
};

export type ResolveCurrentActiveContextResult = {
  context: ActiveContext;
  /** True when selection was invalid/stale and PERSONAL was used instead. */
  fellBackToPersonal: boolean;
  selectionApplied: ActiveContextSelection;
};

/**
 * Resolve the current Active Context.
 * Default: PERSONAL when no selection (or selection is personal).
 * Stale/invalid org selection falls back to PERSONAL (avoids stuck unauthorized state).
 */
export async function resolveCurrentActiveContextUseCase(
  input: ResolveCurrentActiveContextInput,
  deps: ActiveContextDeps,
): Promise<ResolveCurrentActiveContextResult> {
  if (!isFoundationActiveContextV1Enabled()) {
    throw new ForbiddenError(
      "Active Context is disabled (TORE_FOUNDATION_ACTIVE_CONTEXT_V1)",
    );
  }

  const selection =
    input.selection ?? ({ type: ActiveContextType.PERSONAL } as const);

  if (selection.type === ActiveContextType.PERSONAL) {
    const context = await resolvePersonalActiveContextUseCase(
      input.actor,
      deps,
    );
    return {
      context,
      fellBackToPersonal: false,
      selectionApplied: { type: ActiveContextType.PERSONAL },
    };
  }

  try {
    const context = await resolveOrganizationActiveContextUseCase(
      input.actor,
      selection.organizationId,
      deps,
    );
    return {
      context,
      fellBackToPersonal: false,
      selectionApplied: selection,
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      const context = await resolvePersonalActiveContextUseCase(
        input.actor,
        deps,
      );
      return {
        context,
        fellBackToPersonal: true,
        selectionApplied: { type: ActiveContextType.PERSONAL },
      };
    }
    throw error;
  }
}

/**
 * Switch Active Context. Organization target must have ACTIVE membership.
 * Does not accept tenantId or membershipId from the client.
 */
export async function switchActiveContextUseCase(
  actor: ActorContext,
  target: ActiveContextSelection,
  deps: ActiveContextDeps,
): Promise<ActiveContext> {
  if (!isFoundationActiveContextV1Enabled()) {
    throw new ForbiddenError(
      "Active Context is disabled (TORE_FOUNDATION_ACTIVE_CONTEXT_V1)",
    );
  }

  if (target.type === ActiveContextType.PERSONAL) {
    return resolvePersonalActiveContextUseCase(actor, deps);
  }

  return resolveOrganizationActiveContextUseCase(
    actor,
    target.organizationId,
    deps,
  );
}
