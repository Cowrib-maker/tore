"use server";

import { headers } from "next/headers";

import type { ActionState } from "@/application/actions/auth.actions";
import { updateClientProfileUseCase } from "@/application/use-cases/profiles/update-client-profile";
import { updateLawyerProfileUseCase } from "@/application/use-cases/profiles/update-lawyer-profile";
import {
  updateClientProfileSchema,
  updateLawyerProfileSchema,
} from "@/application/validators/profile.schema";
import type { ClientProfile, LawyerProfile } from "@/domain/entities/profile";
import type { User } from "@/domain/entities/user";
import {
  DomainError,
  ForbiddenError,
  UnauthorizedError,
} from "@/domain/errors/domain-error";
import { UserRole } from "@/domain/enums";
import {
  auditLogRepository,
  clientProfileRepository,
  lawyerProfileRepository,
  userRepository,
} from "@/infrastructure/repositories";
import { auth } from "@/lib/auth";

function mapError(error: unknown): ActionState {
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  console.error(error);
  return { error: "An unexpected error occurred" };
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

async function requireSessionUser(role: UserRole) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError("You must be signed in");
  }
  if (session.user.role !== role) {
    throw new ForbiddenError();
  }
  return session.user;
}

export async function updateClientProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireSessionUser(UserRole.CLIENT);
    const parsed = updateClientProfileSchema.safeParse({
      phone: formData.get("phone") ?? "",
      companyName: formData.get("companyName") ?? "",
    });

    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const ipAddress = await getClientIp();
    await updateClientProfileUseCase(
      user.id,
      parsed.data,
      updateClientDeps,
      ipAddress,
    );
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
    const user = await requireSessionUser(UserRole.LAWYER);
    const parsed = updateLawyerProfileSchema.safeParse({
      headline: formData.get("headline") ?? "",
      bio: formData.get("bio") ?? "",
      yearsOfExperience: formData.get("yearsOfExperience") ?? "",
      timezone: formData.get("timezone") ?? "Asia/Ulaanbaatar",
      isListed: formData.get("isListed") === "on",
    });

    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const ipAddress = await getClientIp();
    await updateLawyerProfileUseCase(
      user.id,
      parsed.data,
      updateLawyerDeps,
      ipAddress,
    );
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function getClientProfileForSession(): Promise<{
  user: User;
  profile: ClientProfile;
} | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.CLIENT) {
    return null;
  }

  const [user, profile] = await Promise.all([
    userRepository.findById(session.user.id),
    clientProfileRepository.findByUserId(session.user.id),
  ]);

  if (!user || !profile) {
    return null;
  }

  return { user, profile };
}

export async function getLawyerProfileForSession(): Promise<{
  user: User;
  profile: LawyerProfile;
} | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.LAWYER) {
    return null;
  }

  const [user, profile] = await Promise.all([
    userRepository.findById(session.user.id),
    lawyerProfileRepository.findByUserId(session.user.id),
  ]);

  if (!user || !profile) {
    return null;
  }

  return { user, profile };
}
