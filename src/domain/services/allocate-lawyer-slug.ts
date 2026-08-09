import type { LawyerProfile } from "@/domain/entities/profile";
import { ConflictError } from "@/domain/errors/domain-error";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import { generateLawyerSlug } from "@/domain/services/slug-generator";

const MAX_SLUG_ATTEMPTS = 8;

/**
 * Creates a lawyer profile by generating slugs until create succeeds.
 * Relies on repository mapping unique violations to ConflictError so
 * concurrent allocates cannot lose a check-then-create race.
 */
export async function createLawyerProfileWithUniqueSlug(
  displayName: string,
  userId: string,
  lawyerProfileRepository: LawyerProfileRepository,
  options?: {
    headline?: string;
    timezone?: string;
  },
): Promise<LawyerProfile> {
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = generateLawyerSlug(displayName);
    try {
      return await lawyerProfileRepository.create({
        userId,
        slug,
        headline: options?.headline,
        timezone: options?.timezone,
      });
    } catch (error) {
      if (error instanceof ConflictError) {
        continue;
      }
      throw error;
    }
  }

  throw new ConflictError("Could not allocate a unique lawyer profile slug");
}
