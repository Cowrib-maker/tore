import { NextResponse } from "next/server";

import { lookupAuthSession } from "@/application/common/session";
import { checkOrthographyForPaidUser } from "@/application/use-cases/orthography/check-orthography";
import { UserRole } from "@/domain/enums";
import {
  DomainError,
  SessionReplacedError,
} from "@/domain/errors/domain-error";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import {
  entitlementUsageRepository,
  subscriptionRepository,
  userRepository,
} from "@/infrastructure/repositories";
import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { consumeRateLimit } from "@/infrastructure/security/rate-limiter";

type OrthographyCheckBody = {
  text?: string;
  includeLatinToCyrillic?: boolean;
};

const ORTHOGRAPHY_CHECK_RATE_LIMIT = {
  limit: 40,
  windowMs: 15 * 60 * 1000,
};

export async function POST(request: Request) {
  try {
    const lookup = await lookupAuthSession();
    if (lookup.replaced) {
      throw new SessionReplacedError();
    }
    const session = lookup.session;
    const actor = session?.user?.id
      ? {
          userId: session.user.id,
          role: session.user.role as UserRole,
        }
      : null;

    const rateKey = actor?.userId ?? "anon-orthography";
    const rate = await consumeRateLimit(
      `orthography-check:${rateKey}`,
      ORTHOGRAPHY_CHECK_RATE_LIMIT.limit,
      ORTHOGRAPHY_CHECK_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) {
      return rateLimitHttpResponse(rate.retryAfterSeconds);
    }

    const body = (await request.json()) as OrthographyCheckBody;
    const text = typeof body.text === "string" ? body.text : "";
    const includeLatinToCyrillic = Boolean(body.includeLatinToCyrillic);

    const result = await checkOrthographyForPaidUser(
      actor,
      { text, includeLatinToCyrillic },
      {
        subscriptionRepository,
        entitlementUsageRepository,
        userRepository,
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EntitlementError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    if (error instanceof DomainError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error("[orthography/check]", error);
    return NextResponse.json(
      { error: "Алдаа шалгах үед алдаа гарлаа.", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
