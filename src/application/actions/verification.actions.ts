"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { getClientIp } from "@/application/common/client-ip";
import { mapActionError } from "@/application/common/map-action-error";
import { parseWithSchema } from "@/application/common/parse-form";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { requireActor } from "@/application/common/require-actor";
import { getSessionUser } from "@/application/common/session";
import { reviewLawyerCredentialUseCase } from "@/application/use-cases/verification/review-lawyer-credential";
import { submitLawyerCredentialUseCase } from "@/application/use-cases/verification/submit-lawyer-credential";
import {
  CREDENTIAL_ALLOWED_TYPES,
  CREDENTIAL_MAX_BYTES,
  reviewLawyerCredentialSchema,
  submitLawyerCredentialSchema,
} from "@/application/validators/verification.schema";
import type { LawyerCredential, LawyerProfile } from "@/domain/entities/profile";
import { CredentialReviewStatus, UserRole } from "@/domain/enums";
import { unitOfWork } from "@/infrastructure/database/prisma-unit-of-work";
import {
  auditLogRepository,
  lawyerCredentialRepository,
  lawyerProfileRepository,
} from "@/infrastructure/repositories";
import {
  CREDENTIAL_REVIEW_RATE_LIMIT,
  CREDENTIAL_SUBMIT_RATE_LIMIT,
} from "@/infrastructure/security/rate-limiter";
import { getFileStorage } from "@/infrastructure/storage";
import { buildAppFilePath } from "@/infrastructure/storage/file-access";

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
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `credential:submit:${actor.userId}`,
      CREDENTIAL_SUBMIT_RATE_LIMIT,
    );
    if (limited) return limited;
    const parsed = parseWithSchema(submitLawyerCredentialSchema, {
      licenseNumber: formData.get("licenseNumber") ?? "",
      issuingAuthority: formData.get("issuingAuthority") ?? "",
    });
    if (!parsed.ok) return parsed.state;

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
    return mapActionError(error);
  }
}

export async function reviewLawyerCredentialAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const limited = await enforceRateLimit(
      `credential:review:${actor.userId}`,
      CREDENTIAL_REVIEW_RATE_LIMIT,
    );
    if (limited) return limited;
    const parsed = parseWithSchema(reviewLawyerCredentialSchema, {
      credentialId: formData.get("credentialId") ?? "",
      decision: formData.get("decision") ?? "",
      rejectionReason: formData.get("rejectionReason") ?? "",
    });
    if (!parsed.ok) return parsed.state;

    const ipAddress = await getClientIp();
    await reviewLawyerCredentialUseCase(
      actor,
      parsed.data,
      reviewDeps,
      ipAddress,
    );

    revalidatePath("/admin/lawyers");
    revalidatePath("/lawyer/verification");
    revalidatePath("/lawyer/profile");
    revalidatePath("/lawyer/dashboard");
    revalidatePath("/lawyers");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
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

  const { items: pending } =
    await lawyerCredentialRepository.findPendingReview();
  const { userRepository } = await import("@/infrastructure/repositories");

  const items = (
    await Promise.all(
      pending.map(async (credential) => {
        const lawyer = await lawyerProfileRepository.findById(
          credential.lawyerProfileId,
        );
        if (!lawyer) return null;
        const user = await userRepository.findById(lawyer.userId);
        return {
          credential,
          lawyer,
          lawyerEmail: user?.email ?? null,
          lawyerName: user?.name ?? null,
          documentUrl: buildAppFilePath(credential.documentUrl),
        } satisfies AdminCredentialQueueItem;
      }),
    )
  ).filter((item): item is AdminCredentialQueueItem => item != null);

  return { status: "ok", items };
}
