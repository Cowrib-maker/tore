import type { CreateReviewInput, Review } from "@/domain/entities/trust";
import type { ReviewRepository } from "@/domain/repositories/trust-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import { mapUniqueViolation } from "@/infrastructure/database/prisma-errors";

type ReviewRow = {
  id: string;
  bookingId: string;
  clientUserId: string;
  lawyerProfileId: string;
  rating: number;
  comment: string | null;
  isVisible: boolean;
  moderatedByUserId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapReview(row: ReviewRow): Review {
  return {
    id: row.id,
    bookingId: row.bookingId,
    clientUserId: row.clientUserId,
    lawyerProfileId: row.lawyerProfileId,
    rating: row.rating,
    comment: row.comment,
    isVisible: row.isVisible,
    moderatedByUserId: row.moderatedByUserId,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaReviewRepository implements ReviewRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string): Promise<Review | null> {
    const record = await this.db.review.findFirst({
      where: { id, deletedAt: null },
    });
    return record ? mapReview(record) : null;
  }

  async findByBookingId(bookingId: string): Promise<Review | null> {
    const record = await this.db.review.findFirst({
      where: { bookingId, deletedAt: null },
    });
    return record ? mapReview(record) : null;
  }

  async findVisibleByLawyerProfileId(lawyerProfileId: string): Promise<Review[]> {
    const records = await this.db.review.findMany({
      where: { lawyerProfileId, isVisible: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return records.map(mapReview);
  }

  async create(input: CreateReviewInput): Promise<Review> {
    try {
      const record = await this.db.review.create({
        data: {
          bookingId: input.bookingId,
          clientUserId: input.clientUserId,
          lawyerProfileId: input.lawyerProfileId,
          rating: input.rating,
          comment: input.comment,
        },
      });
      return mapReview(record);
    } catch (error) {
      mapUniqueViolation(error, "This booking has already been reviewed");
    }
  }

  async setVisibility(
    id: string,
    isVisible: boolean,
    moderatedByUserId?: string,
  ): Promise<Review> {
    const record = await this.db.review.update({
      where: { id },
      data: { isVisible, moderatedByUserId },
    });
    return mapReview(record);
  }

  async softDelete(id: string): Promise<void> {
    await this.db.review.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

export const reviewRepository = new PrismaReviewRepository();
