"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/application/common/action-state";
import { getClientIp } from "@/application/common/client-ip";
import { mapActionError } from "@/application/common/map-action-error";
import { requireActor } from "@/application/common/require-actor";
import { getSessionUser } from "@/application/common/session";
import {
  assertCanImpersonateTarget,
  bulkApprovePendingCredentialsDev,
  ensureActiveOfferingDev,
  listAdminDevUsers,
  makeLawyerDirectoryReadyDev,
  markUserEmailVerifiedDev,
  setLawyerListedDev,
  setLawyerVerificationDev,
  type AdminDevUserRow,
} from "@/application/use-cases/admin/admin-devtools";
import { assertAdminDevtoolsEnabled } from "@/application/common/assert-admin-devtools";
import { LawyerVerificationStatus, UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { unitOfWork } from "@/infrastructure/database/prisma-unit-of-work";
import {
  consultationOfferingRepository,
  lawyerCredentialRepository,
  lawyerProfileRepository,
  userRepository,
} from "@/infrastructure/repositories";
import { unstable_update } from "@/lib/auth";
import { isAdminDevtoolsEnabled } from "@/lib/feature-flags";

const deps = {
  userRepository,
  lawyerProfileRepository,
  lawyerCredentialRepository,
  consultationOfferingRepository,
  unitOfWork,
};

function revalidateDevSurfaces() {
  revalidatePath("/admin/dev");
  revalidatePath("/admin/lawyers");
  revalidatePath("/admin/dashboard");
  revalidatePath("/lawyers");
  revalidatePath("/lawyer/dashboard");
  revalidatePath("/lawyer/profile");
  revalidatePath("/lawyer/verification");
  revalidatePath("/lawyer/offerings");
  revalidatePath("/client/dashboard");
}

export async function getAdminDevConsoleData(): Promise<
  | { status: "disabled" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "ok"; rows: AdminDevUserRow[]; pendingCount: number }
> {
  if (!isAdminDevtoolsEnabled()) {
    return { status: "disabled" };
  }

  const session = await getSessionUser();
  if (!session?.user?.id) return { status: "unauthenticated" };
  if (session.user.role !== UserRole.ADMIN || session.user.impersonatorId) {
    return { status: "forbidden" };
  }

  try {
    const actor = await requireActor(UserRole.ADMIN);
    const [rows, pending] = await Promise.all([
      listAdminDevUsers(actor, deps),
      lawyerCredentialRepository.findPendingReview({ take: 100 }),
    ]);
    return { status: "ok", rows, pendingCount: pending.items.length };
  } catch {
    return { status: "forbidden" };
  }
}

export async function adminDevMarkEmailVerifiedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const userId = String(formData.get("userId") ?? "");
    await markUserEmailVerifiedDev(
      actor,
      userId,
      deps,
      await getClientIp(),
    );
    revalidateDevSurfaces();
    return { success: true, message: "Email marked verified" };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminDevSetListedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const userId = String(formData.get("userId") ?? "");
    const isListed = String(formData.get("isListed") ?? "") === "true";
    await setLawyerListedDev(
      actor,
      userId,
      isListed,
      deps,
      await getClientIp(),
    );
    revalidateDevSurfaces();
    return {
      success: true,
      message: isListed ? "Listed on marketplace" : "Unlisted",
    };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminDevSetVerificationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const userId = String(formData.get("userId") ?? "");
    const status = String(
      formData.get("status") ?? "",
    ) as LawyerVerificationStatus;
    await setLawyerVerificationDev(
      actor,
      userId,
      status,
      deps,
      await getClientIp(),
    );
    revalidateDevSurfaces();
    return { success: true, message: `Verification set to ${status}` };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminDevEnsureOfferingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const userId = String(formData.get("userId") ?? "");
    await ensureActiveOfferingDev(
      actor,
      userId,
      deps,
      await getClientIp(),
    );
    revalidateDevSurfaces();
    return { success: true, message: "Active offering ensured" };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminDevMakeDirectoryReadyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const userId = String(formData.get("userId") ?? "");
    await makeLawyerDirectoryReadyDev(
      actor,
      userId,
      deps,
      await getClientIp(),
    );
    revalidateDevSurfaces();
    return {
      success: true,
      message: "Lawyer is directory-ready (verified, offered, listed)",
    };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminDevBulkApproveAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const { approved } = await bulkApprovePendingCredentialsDev(
      actor,
      deps,
      await getClientIp(),
    );
    revalidateDevSurfaces();
    return {
      success: true,
      message: `Approved ${approved} pending credential(s)`,
    };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminDevImpersonateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const userId = String(formData.get("userId") ?? "");
    const target = await assertCanImpersonateTarget(actor, userId, deps);
    await unstable_update({
      impersonateUserId: target.id,
    } as never);
    redirect(getDashboardPath(target.role as UserRole));
  } catch (error) {
    // redirect() throws; rethrow NEXT redirects
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return mapActionError(error);
  }
}

export async function adminDevStopImpersonationAction(): Promise<void> {
  try {
    assertAdminDevtoolsEnabled();
    const session = await getSessionUser();
    if (!session?.user?.impersonatorId) {
      return;
    }
    await unstable_update({ stopImpersonation: true } as never);
    redirect("/admin/dev");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    // Banner is fire-and-forget; swallow non-redirect failures.
  }
}
