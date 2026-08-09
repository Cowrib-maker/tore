"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { ActionState } from "@/application/actions/auth.actions";
import { getSessionUser } from "@/application/actions/auth.actions";
import type { ActorContext } from "@/application/common/actor-context";
import { reviewLawyerCredentialUseCase } from "@/application/use-cases/verification/review-lawyer-credential";
import { submitLawyerCredentialUseCase } from "@/application/use-cases/verification/submit-lawyer-credential";
import {
  CREDENTIAL_ALLOWED_TYPES,
  CREDENTIAL_MAX_BYTES,
  reviewLawyerCredentialSchema,
  submitLawyerCredentialSchema,
} from "@/application/validators/verification.schema";
import type { LawyerCredential, LawyerProfile } from "@/domain/entities/profile";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/domain/errors/domain-error";
import { CredentialReviewStatus, UserRole } from "@/domain/enums";
import { mapActionError } from "@/application/common/map-action-error";
import { unitOfWork } from "@/infrastructure/database/prisma-unit-of-work";
import {
  auditLogRepository,
  lawyerCredentialRepository,
  lawyerProfileRepository,
} from "@/infrastructure/repositories";
import {
  CREDENTIAL_REVIEW_RATE_LIMIT,
  CREDENTIAL_SUBMIT_RATE_LIMIT,
  consumeRateLimit,
} from "@/infrastructure/security/rate-limiter";
import { getFileStorage } from "@/infrastructure/storage";

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

const submitDeps = {
  lawyerProfileRepository,
  lawyerCredentialRepository,
  auditLogRepository,
  fileStorage: getFileStorage(),
  unitOfWork,
};

const reviewDeps = {
  lawyerCredentialRepository,
  unitOfWork,
};

export async function submitLawyerCredentialAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSessionUser(UserRole.LAWYER);
    const rate = await consumeRateLimit(
      `credential:submit:${actor.userId}`,
      CREDENTIAL_SUBMIT_RATE_LIMIT.limit,
      CREDENTIAL_SUBMIT_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    const parsed = submitLawyerCredentialSchema.safeParse({
      licenseNumber: formData.get("licenseNumber") ?? "",
      issuingAuthority: formData.get("issuingAuthority") ?? "",
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const file = formData.get("document");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "License document is required" };
    }
    if (file.size > CREDENTIAL_MAX_BYTES) {
      return { error: "Document must be 10MB or smaller" };
    }
    if (
      !CREDENTIAL_ALLOWED_TYPES.includes(
        file.type as (typeof CREDENTIAL_ALLOWED_TYPES)[number],
      )
    ) {
      return { error: "Document must be PDF, JPEG, PNG, or WebP" };
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const ipAddress = await getClientIp();
    await submitLawyerCredentialUseCase(
      actor,
      parsed.data,
      {
        fileName: file.name || "credential.pdf",
        contentType: file.type,
        body: buffer,
      },
      submitDeps,
      ipAddress,
    );

    revalidatePath("/lawyer/verification");
    revalidatePath("/lawyer/dashboard");
    revalidatePath("/admin/lawyers");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function reviewLawyerCredentialAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSessionUser(UserRole.ADMIN);
    const rate = await consumeRateLimit(
      `credential:review:${actor.userId}`,
      CREDENTIAL_REVIEW_RATE_LIMIT.limit,
      CREDENTIAL_REVIEW_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    const parsed = reviewLawyerCredentialSchema.safeParse({
      credentialId: formData.get("credentialId") ?? "",
      decision: formData.get("decision") ?? "",
      rejectionReason: formData.get("rejectionReason") ?? "",
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const ipAddress = await getClientIp();
    await reviewLawyerCredentialUseCase(
      actor,
      parsed.data,
      reviewDeps,
      ipAddress,
    );

    revalidatePath("/admin/lawyers");
    revalidatePath("/lawyer/verification");
    revalidatePath("/lawyer/dashboard");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export type LawyerVerificationView = {
  profile: LawyerProfile;
  credentials: LawyerCredential[];
  canSubmit: boolean;
};

export async function getLawyerVerificationForSession(): Promise<
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "profile_missing" }
  | { status: "ok"; data: LawyerVerificationView }
> {
  const session = await getSessionUser();
  if (!session?.user?.id) {
    return { status: "unauthenticated" };
  }
  if (session.user.role !== UserRole.LAWYER) {
    return { status: "forbidden" };
  }

  const profile = await lawyerProfileRepository.findByUserId(session.user.id);
  if (!profile) {
    return { status: "profile_missing" };
  }

  const credentials = await lawyerCredentialRepository.findByLawyerProfileId(
    profile.id,
  );
  const hasPending = credentials.some(
    (c) => c.status === CredentialReviewStatus.SUBMITTED,
  );

  return {
    status: "ok",
    data: {
      profile,
      credentials,
      canSubmit:
        (profile.verificationStatus === "PENDING" ||
          profile.verificationStatus === "REJECTED") &&
        !hasPending,
    },
  };
}

export type AdminCredentialQueueItem = {
  credential: LawyerCredential;
  lawyer: LawyerProfile;
  lawyerEmail: string | null;
  lawyerName: string | null;
  documentUrl: string;
};

export async function getAdminLawyerVerificationQueue(): Promise<
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "ok"; items: AdminCredentialQueueItem[] }
> {
  const session = await getSessionUser();
  if (!session?.user?.id) {
    return { status: "unauthenticated" };
  }
  if (session.user.role !== UserRole.ADMIN) {
    return { status: "forbidden" };
  }

  const pending = await lawyerCredentialRepository.findPendingReview();
  const storage = getFileStorage();
  const { userRepository } = await import("@/infrastructure/repositories");

  const items: AdminCredentialQueueItem[] = [];
  for (const credential of pending) {
    const lawyer = await lawyerProfileRepository.findById(
      credential.lawyerProfileId,
    );
    if (!lawyer) continue;
    const user = await userRepository.findById(lawyer.userId);
    const documentUrl = await storage.getUrl(credential.documentUrl);
    items.push({
      credential,
      lawyer,
      lawyerEmail: user?.email ?? null,
      lawyerName: user?.name ?? null,
      documentUrl,
    });
  }

  return { status: "ok", items };
}
