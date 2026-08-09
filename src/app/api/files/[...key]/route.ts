import { NextResponse } from "next/server";

import { getSessionUser } from "@/application/actions/auth.actions";
import { assertCanAccessStoredFile } from "@/application/services/assert-can-access-stored-file";
import { DomainError } from "@/domain/errors/domain-error";
import { UserRole } from "@/domain/enums";
import {
  lawyerCredentialRepository,
  lawyerProfileRepository,
} from "@/infrastructure/repositories";
import { getFileStorage } from "@/infrastructure/storage";

type RouteContext = {
  params: Promise<{ key: string[] }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await getSessionUser();
    if (!session?.user?.id || !session.user.role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key: segments } = await context.params;
    const key = segments.map(decodeURIComponent).join("/");

    await assertCanAccessStoredFile(
      {
        userId: session.user.id,
        role: session.user.role as UserRole,
      },
      key,
      { lawyerProfileRepository, lawyerCredentialRepository },
    );

    const object = await getFileStorage().getObject(key);
    const safeName = sanitizeContentDispositionFilename(
      object.originalFileName ?? "file",
    );
    return new NextResponse(Buffer.from(object.body), {
      status: 200,
      headers: {
        "Content-Type": object.contentType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      const message =
        error.code === "NOT_FOUND"
          ? "The requested resource was not found."
          : error.code === "FORBIDDEN"
            ? "You do not have permission to perform this action."
            : error.code === "UNAUTHORIZED"
              ? "Please sign in to continue."
              : "Request failed";
      return NextResponse.json({ error: message }, { status: error.statusCode });
    }
    console.error(error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

function sanitizeContentDispositionFilename(name: string): string {
  return name
    .replace(/[\r\n"]/g, "")
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .slice(0, 180) || "file";
}
