"use server";

import { cache } from "react";
import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { getClientIp } from "@/application/common/client-ip";
import { mapActionError } from "@/application/common/map-action-error";
import { parseWithSchema } from "@/application/common/parse-form";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { requireActor } from "@/application/common/require-actor";
import { getSessionUser } from "@/application/common/session";
import { updateClientProfileUseCase } from "@/application/use-cases/profiles/update-client-profile";
import { updateLawyerProfileUseCase } from "@/application/use-cases/profiles/update-lawyer-profile";
import {
  updateClientProfileSchema,
  updateLawyerProfileSchema,
} from "@/application/validators/profile.schema";
import type { ClientProfile, LawyerProfile } from "@/domain/entities/profile";
import type { User } from "@/domain/entities/user";
import { UserRole } from "@/domain/enums";
import {
  auditLogRepository,
  clientProfileRepository,
  lawyerProfileRepository,
  userRepository,
} from "@/infrastructure/repositories";
import { PROFILE_WRITE_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";

const updateClientDeps = {
  clientProfileRepository,
  auditLogRepository,
};

const updateLawyerDeps = {
  lawyerProfileRepository,
  userRepository,
  auditLogRepository,
};

export async function updateClientProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    const limited = await enforceRateLimit(
      `profile:write:${actor.userId}`,
      PROFILE_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
    const parsed = parseWithSchema(updateClientProfileSchema, {
      phone: formData.get("phone") ?? "",
      companyName: formData.get("companyName") ?? "",
    });
    if (!parsed.ok) return parsed.state;

    const ipAddress = await getClientIp();
    await updateClientProfileUseCase(
      actor,
      parsed.data,
      updateClientDeps,
      ipAddress,
    );
    revalidatePath("/client/profile");
    revalidatePath("/client/dashboard");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function updateLawyerProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `profile:write:${actor.userId}`,
      PROFILE_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
    const parsed = parseWithSchema(updateLawyerProfileSchema, {
      headline: formData.get("headline") ?? "",
      bio: formData.get("bio") ?? "",
      yearsOfExperience: formData.get("yearsOfExperience") ?? "",
      city: formData.get("city") ?? "",
      education: formData.get("education") ?? "",
      timezone: formData.get("timezone") ?? "Asia/Ulaanbaatar",
      lastName: formData.get("lastName") ?? "",
      firstName: formData.get("firstName") ?? "",
      phone: formData.get("phone") ?? "",
    });
    if (!parsed.ok) return parsed.state;

    const ipAddress = await getClientIp();
    const updated = await updateLawyerProfileUseCase(
      actor,
      parsed.data,
      updateLawyerDeps,
      ipAddress,
    );
    revalidatePath("/lawyer/profile");
    revalidatePath("/lawyer/dashboard");
    revalidatePath("/lawyers");
    revalidatePath(`/lawyers/${updated.slug}`);
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export type ClientProfileSessionResult =
  | { status: "ok"; user: User; profile: ClientProfile }
  | { status: "unauthenticated" }
  | { status: "profile_missing"; user: User };

export type LawyerProfileSessionResult =
  | {
      status: "ok";
      user: User;
      profile: LawyerProfile;
      hasActiveOffering: boolean;
    }
  | { status: "unauthenticated" }
  | { status: "profile_missing"; user: User };

export const getClientProfileForSession = cache(
  async (): Promise<ClientProfileSessionResult> => {
    const session = await getSessionUser();
    if (!session?.user?.id || session.user.role !== UserRole.CLIENT) {
      return { status: "unauthenticated" };
    }

    const [user, profile] = await Promise.all([
      userRepository.findById(session.user.id),
      clientProfileRepository.findByUserId(session.user.id),
    ]);

    if (!user) {
      return { status: "unauthenticated" };
    }

    if (!profile) {
      return { status: "profile_missing", user };
    }

    return { status: "ok", user, profile };
  },
);

export const getLawyerProfileForSession = cache(
  async (): Promise<LawyerProfileSessionResult> => {
    const session = await getSessionUser();
    if (!session?.user?.id || session.user.role !== UserRole.LAWYER) {
      return { status: "unauthenticated" };
    }

    const [user, profile] = await Promise.all([
      userRepository.findById(session.user.id),
      lawyerProfileRepository.findByUserId(session.user.id),
    ]);

    if (!user) {
      return { status: "unauthenticated" };
    }

    if (!profile) {
      return { status: "profile_missing", user };
    }

    const hasActiveOffering = await lawyerProfileRepository.hasActiveOffering(
      profile.id,
    );

    return { status: "ok", user, profile, hasActiveOffering };
  },
);
