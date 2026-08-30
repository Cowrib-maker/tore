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
import { setLawyerDirectoryListingUseCase } from "@/application/use-cases/profiles/set-lawyer-directory-listing";
import {
  CREDENTIAL_ALLOWED_TYPES,
  CREDENTIAL_MAX_BYTES,
  reviewLawyerCredentialSchema,
  setLawyerDirectoryListingSchema,
  submitLawyerCredentialSchema,
} from "@/application/validators/verification.schema";
import type { LawyerCredential, LawyerProfile } from "@/domain/entities/profile";
import type { PracticeArea } from "@/domain/entities/taxonomy";
import { CredentialReviewStatus, UserRole } from "@/domain/enums";
import { canSubmitCredentials } from "@/domain/services/lawyer-eligibility";
import { unitOfWork } from "@/infrastructure/database/prisma-unit-of-work";
import {
  auditLogRepository,
  lawyerCredentialRepository,
  lawyerProfileRepository,
  lawyerTaxonomyRepository,
  practiceAreaRepository,
} from "@/infrastructure/repositories";
import {
  CREDENTIAL_REVIEW_RATE_LIMIT,
  CREDENTIAL_SUBMIT_RATE_LIMIT,
  PROFILE_WRITE_RATE_LIMIT,
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
    revalidatePath("/lawyer/profile");
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

export async function setLawyerDirectoryListingAction(
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
    const parsed = parseWithSchema(setLawyerDirectoryListingSchema, {
      lawyerProfileId: formData.get("lawyerProfileId") ?? "",
      isListed: formData.get("isListed") ?? "",
    });
    if (!parsed.ok) return parsed.state;

    const ipAddress = await getClientIp();
    const updated = await setLawyerDirectoryListingUseCase(
      actor,
      parsed.data,
      {
        lawyerProfileRepository,
        auditLogRepository,
      },
      ipAddress,
    );

    revalidatePath("/admin/lawyers");
    revalidatePath("/lawyer/profile");
    revalidatePath("/lawyer/dashboard");
    revalidatePath("/lawyers");
    revalidatePath(`/lawyers/${updated.slug}`);
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function setOwnLawyerDirectoryListingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `directory:listing:${actor.userId}`,
      PROFILE_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
    const parsed = parseWithSchema(setLawyerDirectoryListingSchema, {
      lawyerProfileId: formData.get("lawyerProfileId") ?? "",
      isListed: formData.get("isListed") ?? "",
    });
    if (!parsed.ok) return parsed.state;

    const ipAddress = await getClientIp();
    const updated = await setLawyerDirectoryListingUseCase(
      actor,
      parsed.data,
      {
        lawyerProfileRepository,
        auditLogRepository,
      },
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
      canSubmit: canSubmitCredentials(profile) && !hasPending,
    },
  };
}

export type AdminCredentialQueueItem = {
  credential: LawyerCredential;
  lawyer: LawyerProfile;
  lawyerEmail: string | null;
  lawyerName: string | null;
  documentUrl: string;
  practiceAreas: PracticeArea[];
};

export type AdminLawyerDirectoryItem = {
  lawyer: LawyerProfile;
  lawyerEmail: string | null;
  lawyerName: string | null;
  practiceAreas: PracticeArea[];
  latestCredential: LawyerCredential | null;
  documentUrl: string | null;
  hasActiveOffering: boolean;
};

export async function getAdminLawyerVerificationQueue(): Promise<
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | {
      status: "ok";
      items: AdminCredentialQueueItem[];
      directory: AdminLawyerDirectoryItem[];
    }
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

  const allPracticeAreas = await practiceAreaRepository.findAllActive();
  const practiceById = new Map(allPracticeAreas.map((area) => [area.id, area]));

  async function practiceAreasFor(profileId: string): Promise<PracticeArea[]> {
    const links = await lawyerTaxonomyRepository.getPracticeAreas(profileId);
    return links
      .map((link) => practiceById.get(link.practiceAreaId))
      .filter((area): area is PracticeArea => Boolean(area));
  }

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
          practiceAreas: await practiceAreasFor(lawyer.id),
        } satisfies AdminCredentialQueueItem;
      }),
    )
  ).filter((item): item is AdminCredentialQueueItem => item != null);

  const lawyerUsers = await userRepository.findByRole(UserRole.LAWYER);
  const directory = (
    await Promise.all(
      lawyerUsers.map(async (user): Promise<AdminLawyerDirectoryItem | null> => {
        const lawyer = await lawyerProfileRepository.findByUserId(user.id);
        if (!lawyer) return null;
        const credentials =
          await lawyerCredentialRepository.findByLawyerProfileId(lawyer.id);
        const latestCredential = credentials[0] ?? null;
        const approvedCredential =
          credentials.find(
            (credential) =>
              credential.status === CredentialReviewStatus.APPROVED,
          ) ?? latestCredential;
        return {
          lawyer,
          lawyerEmail: user.email ?? null,
          lawyerName: user.name ?? null,
          practiceAreas: await practiceAreasFor(lawyer.id),
          latestCredential: approvedCredential,
          documentUrl: approvedCredential
            ? buildAppFilePath(approvedCredential.documentUrl)
            : null,
          hasActiveOffering: await lawyerProfileRepository.hasActiveOffering(
            lawyer.id,
          ),
        };
      }),
    )
  ).filter((item): item is AdminLawyerDirectoryItem => item != null);

  return { status: "ok", items, directory };
}
