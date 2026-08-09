import type {
  CreateNotificationInput,
  CreateReviewInput,
  Notification,
  Review,
} from "@/domain/entities/trust";

export interface ReviewRepository {
  findById(id: string): Promise<Review | null>;
  findByBookingId(bookingId: string): Promise<Review | null>;
  findVisibleByLawyerProfileId(lawyerProfileId: string): Promise<Review[]>;
  create(input: CreateReviewInput): Promise<Review>;
  setVisibility(id: string, isVisible: boolean, moderatedByUserId?: string): Promise<Review>;
  softDelete(id: string): Promise<void>;
}

export interface NotificationRepository {
  findById(id: string): Promise<Notification | null>;
  findByUserId(userId: string, unreadOnly?: boolean): Promise<Notification[]>;
  create(input: CreateNotificationInput): Promise<Notification>;
  markRead(ids: string[], readAt?: Date): Promise<void>;
  markAllReadForUser(userId: string): Promise<void>;
}
