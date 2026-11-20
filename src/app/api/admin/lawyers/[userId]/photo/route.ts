import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getClientIp } from "@/application/common/client-ip";
import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { requireActor } from "@/application/common/require-actor";
import {
  PROFILE_PHOTO_SIZE_MESSAGE,
  PROFILE_PHOTO_TYPE_MESSAGE,
  uploadProfilePhotoUseCase,
} from "@/application/use-cases/profiles/upload-profile-photo";
import { PROFILE_PHOTO_MAX_BYTES } from "@/application/validators/profile.schema";
import { UserRole } from "@/domain/enums";
import { DomainError } from "@/domain/errors/domain-error";
import {
  auditLogRepository,
  lawyerProfileRepository,
  userRepository,
} from "@/infrastructure/repositories";
import {
  consumeRateLimit,
  PROFILE_WRITE_RATE_LIMIT,
} from "@/infrastructure/security/rate-limiter";
import { getFileStorage } from "@/infrastructure/storage";
import { resolveProfilePhotoUrl } from "@/infrastructure/storage/file-access";

export const maxDuration = 30;

/** Multipart framing allowance on top of the file bytes. */
const REQUEST_OVERHEAD_BYTES = 64 * 1024;

/**
 * ADMIN-ONLY lawyer photo management. The actor and its role come from the
 * session (re-read from the database by requireActor), never from the request.
 * Lawyers have no way to change their own photo; a non-admin gets 403 and an
 * anonymous caller 401 before the body is read. The target is the URL's user
 * id and the use case refuses anything that is not a lawyer account.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const { userId: targetUserId } = await context.params;

    const rate = await consumeRateLimit(
      `admin:lawyer-photo:${actor.userId}`,
      PROFILE_WRITE_RATE_LIMIT.limit,
      PROFILE_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) {
      return rateLimitHttpResponse(rate.retryAfterSeconds);
    }

    const declared = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(declared) &&
      declared > PROFILE_PHOTO_MAX_BYTES + REQUEST_OVERHEAD_BYTES
    ) {
      return NextResponse.json(
        { error: PROFILE_PHOTO_SIZE_MESSAGE, code: "FILE_TOO_LARGE" },
        { status: 413 },
      );
    }

    let file: FormDataEntryValue | null = null;
    try {
      file = (await request.formData()).get("photo");
    } catch {
      file = null;
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: PROFILE_PHOTO_TYPE_MESSAGE, code: "UNSUPPORTED_FILE_TYPE" },
        { status: 400 },
      );
    }

    const updated = await uploadProfilePhotoUseCase(
      actor,
      targetUserId,
      {
        fileName: file.name || "photo",
        contentType: file.type,
        body: new Uint8Array(await file.arrayBuffer()),
      },
      {
        userRepository,
        lawyerProfileRepository,
        auditLogRepository,
        fileStorage: getFileStorage(),
      },
      await getClientIp(),
    );

    revalidatePath("/admin/lawyers");
    revalidatePath("/lawyer/profile");
    revalidatePath("/lawyer/dashboard");
    revalidatePath("/lawyers");
    return NextResponse.json({
      ok: true,
      photoUrl: resolveProfilePhotoUrl(updated.image, { forOwner: true }),
    });
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === "VALIDATION_ERROR" ? 400 : error.statusCode;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    console.error("admin lawyer photo upload error", error);
    return NextResponse.json(
      { error: "Зургийг хадгалахад алдаа гарлаа.", code: "UPLOAD_FAILED" },
      { status: 500 },
    );
  }
}
