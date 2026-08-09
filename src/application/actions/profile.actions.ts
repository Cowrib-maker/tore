"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { ActionState } from "@/application/actions/auth.actions";
import { getSessionUser } from "@/application/actions/auth.actions";
import type { ActorContext } from "@/application/common/actor-context";
import { updateClientProfileUseCase } from "@/application/use-cases/profiles/update-client-profile";
import { updateLawyerProfileUseCase } from "@/application/use-cases/profiles/update-lawyer-profile";
import {
  updateClientProfileSchema,
  updateLawyerProfileSchema,
} from "@/application/validators/profile.schema";
import type { ClientProfile, LawyerProfile } from "@/domain/entities/profile";
import type { User } from "@/domain/entities/user";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/domain/errors/domain-error";
import { UserRole } from "@/domain/enums";
import { mapActionError } from "@/application/common/map-action-error";
import {
  auditLogRepository,
  clientProfileRepository,
  lawyerProfileRepository,
  userRepository,
} from "@/infrastructure/repositories";
import {
  PROFILE_WRITE_RATE_LIMIT,
  consumeRateLimit,
} from "@/infrastructure/security/rate-limiter";

function mapError(error: unknown): ActionState {
  return mapActionError(error);
}

function tooManyWrites(retryAfterSeconds: number): ActionState {
  return {
    error: `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
  };
}

async function getClientIp(): Promise<string | undefined> {
  const headerStore = await headers();
  return (
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    undefined
  );
}

const updateClientDeps = {
  clientProfileRepository,
  auditLogRepository,
};

const updateLawyerDeps = {
  lawyerProfileRepository,
  auditLogRepository,
};

async function requireSessionUser(role: UserRole): Promise<ActorContext> {
  const session = await getSessionUser();
  if (!session?.user?.id) {
    throw new UnauthorizedError("You must be signed in");
  }
  if (session.user.role !== role) {
    throw new ForbiddenError();
  }
  return {
    userId: session.user.id,
    role: session.user.role as UserRole,
  };
}

export async function updateClientProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSessionUser(UserRole.CLIENT);
    const rate = await consumeRateLimit(
      `profile:write:${actor.userId}`,
      PROFILE_WRITE_RATE_LIMIT.limit,
      PROFILE_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    const parsed = updateClientProfileSchema.safeParse({
      phone: formData.get("phone") ?? "",
      companyName: formData.get("companyName") ?? "",
    });

    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

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
    return mapError(error);
  }
}

export async function updateLawyerProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSessionUser(UserRole.LAWYER);
    const rate = await consumeRateLimit(
      `profile:write:${actor.userId}`,
      PROFILE_WRITE_RATE_LIMIT.limit,
      PROFILE_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    const parsed = updateLawyerProfileSchema.safeParse({
      headline: formData.get("headline") ?? "",
      bio: formData.get("bio") ?? "",
      yearsOfExperience: formData.get("yearsOfExperience") ?? "",
      city: formData.get("city") ?? "",
      education: formData.get("education") ?? "",
      timezone: formData.get("timezone") ?? "Asia/Ulaanbaatar",
      isListed: formData.get("isListed") === "on",
    });

    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const ipAddress = await getClientIp();
    await updateLawyerProfileUseCase(
      actor,
      parsed.data,
      updateLawyerDeps,
      ipAddress,
    );
    revalidatePath("/lawyer/profile");
    revalidatePath("/lawyer/dashboard");
    return { success: true };
  } catch (error) {
    return mapError(error);
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

export async function getClientProfileForSession(): Promise<ClientProfileSessionResult> {
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
}

export async function getLawyerProfileForSession(): Promise<LawyerProfileSessionResult> {
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
}
