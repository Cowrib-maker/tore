import { NextResponse } from "next/server";

import { requireActor } from "@/application/common/require-actor";
import { assertCanAccessStoredFile } from "@/application/services/assert-can-access-stored-file";
import { DomainError } from "@/domain/errors/domain-error";
import {
  lawyerCredentialRepository,
  lawyerProfileRepository,
} from "@/infrastructure/repositories";
import { getFileStorage } from "@/infrastructure/storage";
import { isSensitiveStorageKey } from "@/infrastructure/storage/file-access";

type RouteContext = {
  params: Promise<{ key: string[] }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await requireActor();

    const { key: segments } = await context.params;
    const key = segments.map(decodeURIComponent).join("/");

    await assertCanAccessStoredFile(actor, key, {
      lawyerProfileRepository,
      lawyerCredentialRepository,
    });

    const object = await getFileStorage().getObject(key);
    const safeName = sanitizeContentDispositionFilename(
      object.originalFileName ?? "file",
    );
    const disposition = isSensitiveStorageKey(key) ? "attachment" : "inline";

    return new NextResponse(Buffer.from(object.body), {
      status: 200,
      headers: {
        "Content-Type": object.contentType,
        "Content-Disposition": `${disposition}; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
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
  return (
    name
      .replace(/[\r\n"]/g, "")
      .replace(/[^\w.\- ()[\]]+/g, "_")
      .slice(0, 180) || "file"
  );
}
