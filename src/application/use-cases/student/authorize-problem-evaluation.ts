import type { ActorContext } from "@/application/common/actor-context";
import { UserRole } from "@/domain/enums";

type AuthorizedEvaluation = {
  allowed: true;
  actor: ActorContext;
  consume: () => Promise<void>;
};

type DeniedEvaluation = {
  allowed: false;
  message: string;
};

export type StudentProblemEvaluationAuthorizationDeps = {
  requireActor: () => Promise<ActorContext>;
  requireVerifiedEmail: (userId: string) => Promise<void>;
  isRateLimited: (userId: string) => Promise<boolean>;
  authorizePaidCitizen: (actor: ActorContext) => Promise<{ usageId: string }>;
  authorizePaidLawyer: (actor: ActorContext) => Promise<{ usageId: string }>;
  consumeCitizen: (usageId: string) => Promise<void>;
  consumeLawyer: (usageId: string) => Promise<void>;
};

const ACCESS_REQUIRED =
  "AI үнэлгээг зөвхөн баталгаажсан, төлбөртэй Legal AI эрхтэй хэрэглэгч ашиглана. Бүтцийн үнэлгээ хэвээр байна.";
const RATE_LIMITED =
  "AI үнэлгээ түр хязгаарлагдсан байна. Бүтцийн үнэлгээ хэвээр байна.";

/**
 * Keeps the student action on the same paid Legal AI guards as the product
 * routes, while returning a safe fallback rather than exposing authorization
 * details to the browser.
 */
export async function authorizeStudentProblemEvaluation(
  deps: StudentProblemEvaluationAuthorizationDeps,
): Promise<AuthorizedEvaluation | DeniedEvaluation> {
  try {
    const actor = await deps.requireActor();
    await deps.requireVerifiedEmail(actor.userId);
    if (await deps.isRateLimited(actor.userId)) {
      return { allowed: false, message: RATE_LIMITED };
    }

    if (actor.role === UserRole.CLIENT) {
      const { usageId } = await deps.authorizePaidCitizen(actor);
      return {
        allowed: true,
        actor,
        consume: () => deps.consumeCitizen(usageId),
      };
    }
    if (actor.role === UserRole.LAWYER) {
      const { usageId } = await deps.authorizePaidLawyer(actor);
      return {
        allowed: true,
        actor,
        consume: () => deps.consumeLawyer(usageId),
      };
    }
  } catch {
    // Deliberately avoid returning authentication, entitlement, or provider detail.
  }
  return { allowed: false, message: ACCESS_REQUIRED };
}
