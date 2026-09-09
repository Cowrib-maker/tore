import { NextResponse } from "next/server";

import { isLawyerPubliclyListed } from "@/domain/services/lawyer-eligibility";
import { DomainError } from "@/domain/errors/domain-error";
import { lawyerProfileRepository } from "@/infrastructure/repositories";
import { getFileStorage } from "@/infrastructure/storage";
import { assertSafeStorageKey } from "@/infrastructure/storage/object-key";

type RouteContext = {
  params: Promise<{ key: string[] }>;
};

// Public, unauthenticated route — only ever serves the "profile-photo"
// purpose, and only for the ATTORNEY position's public marketplace listing
// (see isLawyerPubliclyListed — same gate as the /lawyers/[slug] page).
// Prosecutor/judge/other-lawyer photos are never reachable here: they stay
// behind the authenticated /api/files route (owner + admin only), matching
// the "professional workspace, not public marketplace" scope for those
// positions.
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { key: segments } = await context.params;
    const key = segments.map(decodeURIComponent).join("/");
    assertSafeStorageKey(key);

    const [purpose, ownerId] = key.split("/");
    if (purpose !== "profile-photo" || !ownerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const profile = await lawyerProfileRepository.findByUserId(ownerId);
    if (!profile) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const hasActiveOffering = await lawyerProfileRepository.hasActiveOffering(
      profile.id,
    );
    if (!isLawyerPubliclyListed(profile, hasActiveOffering)) {
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
