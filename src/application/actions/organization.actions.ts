"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/application/common/action-state";
import { mapActionError } from "@/application/common/map-action-error";
import { parseWithSchema } from "@/application/common/parse-form";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { requireActor } from "@/application/common/require-actor";
import { createOrganizationUseCase } from "@/application/use-cases/organizations/create-organization";
import { getMyOrganizationOverviewUseCase } from "@/application/use-cases/organizations/get-my-organization-overview";
import { listMyOrganizationsUseCase } from "@/application/use-cases/organizations/list-my-organizations";
import { createOrganizationSchema } from "@/application/validators/organization.schema";
import {
  organizationRepository,
  unitOfWork,
} from "@/infrastructure/repositories";
import { PROFILE_WRITE_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";

const createDeps = { unitOfWork };

export async function createOrganizationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let organizationId: string | undefined;
  try {
    const actor = await requireActor();
    const limited = await enforceRateLimit(
      `org:create:${actor.userId}`,
      PROFILE_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;

    const parsed = parseWithSchema(createOrganizationSchema, {
      name: formData.get("name") ?? "",
      type: formData.get("type") ?? "",
    });
    if (!parsed.ok) return parsed.state;

    const result = await createOrganizationUseCase(
      {
        actorUserId: actor.userId,
        actorRole: actor.role,
        type: parsed.data.type,
        name: parsed.data.name,
      },
      createDeps,
    );
    organizationId = result.organization.id;
  } catch (error) {
    return mapActionError(error);
  }

  revalidatePath("/organizations");
  redirect(`/organizations/${organizationId}`);
}

export async function getMyOrganizationsForSession() {
  const actor = await requireActor();
  return listMyOrganizationsUseCase(actor, { organizationRepository });
}

export async function getMyOrganizationOverviewForSession(
  organizationId: string,
) {
  const actor = await requireActor();
  return getMyOrganizationOverviewUseCase(actor, organizationId, {
    organizationRepository,
  });
}
