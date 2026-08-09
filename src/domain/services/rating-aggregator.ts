export const MIN_REVIEW_RATING = 1;
export const MAX_REVIEW_RATING = 5;

export function assertValidRating(rating: number): void {
  if (
    !Number.isInteger(rating) ||
    rating < MIN_REVIEW_RATING ||
    rating > MAX_REVIEW_RATING
  ) {
    throw new Error(
      `Rating must be an integer between ${MIN_REVIEW_RATING} and ${MAX_REVIEW_RATING}`,
    );
  }
}

export interface RatingAggregate {
  averageRating: number;
  reviewCount: number;
}

export function computeNextRatingAggregate(
  currentAverage: number | null,
  currentCount: number,
  newRating: number,
): RatingAggregate {
  assertValidRating(newRating);

  const safeCount = Math.max(0, currentCount);
  const safeAverage = currentAverage ?? 0;
  const nextCount = safeCount + 1;
  const nextAverage =
    safeCount === 0
      ? newRating
      : Number(((safeAverage * safeCount + newRating) / nextCount).toFixed(2));

  return {
    averageRating: nextAverage,
    reviewCount: nextCount,
  };
}
