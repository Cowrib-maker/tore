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
 * Own-photo upload. A route handler rather than a Server Action: Server
 * Actions are capped at 1 MB by default, which silently broke ordinary phone
 * photos. The actor comes from the session only — there is no user id in the
 * request, so a lawyer can never address another user's photo.
 */
export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);

    const rate = await consumeRateLimit(
      `profile:photo:${actor.userId}`,
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
      {
        fileName: file.name || "photo",
        contentType: file.type,
        body: new Uint8Array(await file.arrayBuffer()),
      },
      { userRepository, auditLogRepository, fileStorage: getFileStorage() },
      await getClientIp(),
    );

    revalidatePath("/lawyer/profile");
    revalidatePath("/lawyer/dashboard");
    revalidatePath("/lawyers");
    return NextResponse.json({
      ok: true,
      photoUrl: resolveProfilePhotoUrl(updated.image, { forOwner: true }),
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error("profile photo upload error", error);
    return NextResponse.json(
      { error: "Зургийг хадгалахад алдаа гарлаа.", code: "UPLOAD_FAILED" },
      { status: 500 },
    );
  }
}
