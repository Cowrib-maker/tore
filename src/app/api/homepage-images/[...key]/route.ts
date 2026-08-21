import { NextResponse } from "next/server";

import { DomainError } from "@/domain/errors/domain-error";
import { getFileStorage } from "@/infrastructure/storage";
import { assertSafeStorageKey } from "@/infrastructure/storage/object-key";

type RouteContext = {
  params: Promise<{ key: string[] }>;
};

// Public, unauthenticated route — only ever serves the "homepage-image"
// purpose. Homepage marketing images must be visible to anonymous visitors,
// unlike every other purpose served through the authenticated /api/files route.
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { key: segments } = await context.params;
    const key = segments.map(decodeURIComponent).join("/");
    assertSafeStorageKey(key);

    if (key.split("/")[0] !== "homepage-image") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const object = await getFileStorage().getObject(key);

    return new NextResponse(Buffer.from(object.body), {
      status: 200,
      headers: {
        "Content-Type": object.contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.statusCode;
      return NextResponse.json({ error: "Not found" }, { status });
    }
    console.error(error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
