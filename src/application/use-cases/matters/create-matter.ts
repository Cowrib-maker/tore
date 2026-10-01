import type { ActorContext } from "@/application/common/actor-context";
import type { Matter, MatterType } from "@/domain/entities/matter";
import type { MatterRepository } from "@/domain/repositories/matter-repository";
import { ValidationError } from "@/domain/errors/domain-error";
import { matterRepository } from "@/infrastructure/repositories";

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 4000;

const MATTER_TYPES: readonly MatterType[] = [
  "GENERAL",
  "LITIGATION",
  "CONTRACT",
  "EMPLOYMENT",
  "FAMILY",
  "CRIMINAL",
  "ADMINISTRATIVE",
];

export type CreateMatterForActorInput = {
  title: string;
  type?: string;
  description?: string | null;
};

function requireTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new ValidationError("Хэргийн нэрийг оруулна уу.");
  }
  if (trimmed.length > TITLE_MAX_LENGTH) {
    throw new ValidationError(
      `Хэргийн нэр ${TITLE_MAX_LENGTH} тэмдэгтээс хэтрэхгүй байх ёстой.`,
    );
  }
  return trimmed;
}

function resolveType(type: string | undefined): MatterType {
  if (!type) return "GENERAL";
  const upper = type.toUpperCase();
  const match = MATTER_TYPES.find((candidate) => candidate === upper);
  if (!match) {
    throw new ValidationError("Хэргийн төрөл буруу байна.");
  }
  return match;
}

function resolveDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const trimmed = description.trim();
  if (!trimmed) return null;
  if (trimmed.length > DESCRIPTION_MAX_LENGTH) {
    throw new ValidationError(
      `Тайлбар ${DESCRIPTION_MAX_LENGTH} тэмдэгтээс хэтрэхгүй байх ёстой.`,
    );
  }
  // Matter fields are user-provided data, never instructions — the same
  // "treat as untrusted content" rule applied to case facts/evidence.
  // No sanitization is performed here (this is plain display text stored
  // as-is, rendered with React's default escaping, never interpolated into
  // an LLM system prompt in V1 — see legal-ai.service.ts: Matter is not yet
  // wired into prompt context), but the boundary is intentional and
  // documented so a future prompt-context integration doesn't skip it.
  return trimmed;
}

export async function createMatterForActor(
  actor: ActorContext,
  input: CreateMatterForActorInput,
  repository: MatterRepository = matterRepository,
): Promise<Matter> {
  return repository.create({
    ownerId: actor.userId,
    title: requireTitle(input.title),
    type: resolveType(input.type),
    description: resolveDescription(input.description),
  });
}
