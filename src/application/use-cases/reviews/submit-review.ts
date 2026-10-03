import type { ActorContext } from "@/application/common/actor-context";
import type { Review } from "@/domain/entities/trust";
import type { BookingRepository } from "@/domain/repositories/booking-repository";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import type { ReviewRepository } from "@/domain/repositories/trust-repository";
import { BookingStatus, UserRole } from "@/domain/enums";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import {
  bookingRepository,
  lawyerProfileRepository,
  reviewRepository,
} from "@/infrastructure/repositories";

const COMMENT_MAX_LENGTH = 2000;

export type SubmitReviewInput = {
  bookingId: string;
  rating: number;
  comment?: string | null;
};

export type SubmitReviewDeps = {
  bookingRepository: BookingRepository;
  lawyerProfileRepository: LawyerProfileRepository;
  reviewRepository: ReviewRepository;
};

function defaultSubmitReviewDeps(): SubmitReviewDeps {
  return { bookingRepository, lawyerProfileRepository, reviewRepository };
}

/**
 * A review may only be left by the booking's own client, only once the
 * booking is COMPLETED, and only once per booking -- enforced both here
 * (pre-check, for a clean error message) and at the database level
 * (Review.bookingId is @unique, mapped via mapUniqueViolation), so a race
 * between two concurrent submissions still can't produce two reviews.
 */
export async function submitReviewForActor(
  actor: ActorContext,
  input: SubmitReviewInput,
  deps: SubmitReviewDeps = defaultSubmitReviewDeps(),
): Promise<Review> {
  if (actor.role !== UserRole.CLIENT) {
    throw new ForbiddenError("Зөвхөн үйлчлүүлэгч сэтгэгдэл үлдээж болно.");
  }

  const rating = Math.trunc(input.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new ValidationError("Үнэлгээ 1-5 хооронд байх ёстой.");
  }

  const comment = input.comment?.trim() || null;
  if (comment && comment.length > COMMENT_MAX_LENGTH) {
    throw new ValidationError(
      `Сэтгэгдэл ${COMMENT_MAX_LENGTH} тэмдэгтээс хэтрэхгүй байх ёстой.`,
    );
  }

  const booking = await deps.bookingRepository.findById(input.bookingId);
  if (!booking) {
    throw new NotFoundError("Booking", input.bookingId);
  }
  // A missing booking and someone else's booking must look identical to the
  // caller -- both are "not found", never a distinguishing 403.
  if (booking.clientUserId !== actor.userId) {
    throw new NotFoundError("Booking", input.bookingId);
  }
  if (booking.status !== BookingStatus.COMPLETED) {
    throw new ValidationError(
      "Зөвхөн дууссан уулзалтад сэтгэгдэл үлдээж болно.",
    );
  }

  const existing = await deps.reviewRepository.findByBookingId(booking.id);
  if (existing) {
    throw new ConflictError("Та энэ уулзалтад сэтгэгдэл үлдээсэн байна.");
  }

  const review = await deps.reviewRepository.create({
    bookingId: booking.id,
    clientUserId: actor.userId,
    lawyerProfileId: booking.lawyerProfileId,
    rating,
    comment: comment ?? undefined,
  });

  await recomputeRatingAggregate(
    booking.lawyerProfileId,
    deps.reviewRepository,
    deps.lawyerProfileRepository,
  );

  return review;
}

async function recomputeRatingAggregate(
  lawyerProfileId: string,
  reviews: ReviewRepository,
  profiles: LawyerProfileRepository,
): Promise<void> {
  const visible = await reviews.findVisibleByLawyerProfileId(lawyerProfileId);
  const reviewCount = visible.length;
  const averageRating =
    reviewCount === 0
      ? 0
      : visible.reduce((sum, review) => sum + review.rating, 0) / reviewCount;
  await profiles.updateRatingAggregate(lawyerProfileId, averageRating, reviewCount);
}
