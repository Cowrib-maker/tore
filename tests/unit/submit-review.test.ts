import { describe, expect, it, vi } from "vitest";

import { submitReviewForActor } from "@/application/use-cases/reviews/submit-review";
import { BookingStatus, UserRole } from "@/domain/enums";
import { ConflictError, NotFoundError, ValidationError, ForbiddenError } from "@/domain/errors/domain-error";

function actor(userId: string, role: UserRole = UserRole.CLIENT) {
  return { userId, role };
}

function booking(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "booking-1",
    clientUserId: "client-1",
    lawyerProfileId: "lawyer-profile-1",
    status: BookingStatus.COMPLETED,
    ...overrides,
  };
}

function buildDeps(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    bookingRepository: {
      findById: vi.fn().mockResolvedValue(booking()),
    } as never,
    lawyerProfileRepository: {
      updateRatingAggregate: vi.fn().mockResolvedValue({}),
    } as never,
    reviewRepository: {
      findByBookingId: vi.fn().mockResolvedValue(null),
      findVisibleByLawyerProfileId: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve({
          id: "review-1",
          isVisible: true,
          moderatedByUserId: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          comment: input.comment ?? null,
          ...input,
        }),
      ),
    } as never,
    ...overrides,
  };
}

describe("submitReviewForActor", () => {
  it("rejects a non-CLIENT actor", async () => {
    const deps = buildDeps();
    await expect(
      submitReviewForActor(
        actor("lawyer-1", UserRole.LAWYER),
        { bookingId: "booking-1", rating: 5 },
        deps as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects an out-of-range rating", async () => {
    const deps = buildDeps();
    await expect(
      submitReviewForActor(
        actor("client-1"),
        { bookingId: "booking-1", rating: 6 },
        deps as never,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("treats another client's booking as not found (no IDOR-distinguishing error)", async () => {
    const deps = buildDeps({
      bookingRepository: {
        findById: vi.fn().mockResolvedValue(booking({ clientUserId: "someone-else" })),
      } as never,
    });
    await expect(
      submitReviewForActor(
        actor("client-1"),
        { bookingId: "booking-1", rating: 5 },
        deps as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a review for a booking that is not COMPLETED", async () => {
    const deps = buildDeps({
      bookingRepository: {
        findById: vi
          .fn()
          .mockResolvedValue(booking({ status: BookingStatus.CONFIRMED })),
      } as never,
    });
    await expect(
      submitReviewForActor(
        actor("client-1"),
        { bookingId: "booking-1", rating: 5 },
        deps as never,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a second review for the same booking", async () => {
    const deps = buildDeps({
      reviewRepository: {
        findByBookingId: vi.fn().mockResolvedValue({ id: "existing-review" }),
        findVisibleByLawyerProfileId: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      } as never,
    });
    await expect(
      submitReviewForActor(
        actor("client-1"),
        { bookingId: "booking-1", rating: 5 },
        deps as never,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("creates the review and recomputes the lawyer's rating aggregate from visible reviews", async () => {
    const updateRatingAggregate = vi.fn().mockResolvedValue({});
    const deps = buildDeps({
      lawyerProfileRepository: { updateRatingAggregate } as never,
      reviewRepository: {
        findByBookingId: vi.fn().mockResolvedValue(null),
        findVisibleByLawyerProfileId: vi
          .fn()
          .mockResolvedValue([{ rating: 5 }, { rating: 3 }]),
        create: vi.fn().mockResolvedValue({ id: "review-1", rating: 5 }),
      } as never,
    });

    const result = await submitReviewForActor(
      actor("client-1"),
      { bookingId: "booking-1", rating: 5, comment: "Great help" },
      deps as never,
    );

    expect(result.id).toBe("review-1");
    expect(updateRatingAggregate).toHaveBeenCalledWith("lawyer-profile-1", 4, 2);
  });
});
