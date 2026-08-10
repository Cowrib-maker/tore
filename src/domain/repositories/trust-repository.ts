import type {
  CreateNotificationInput,
  CreateReviewInput,
  Notification,
  Review,
} from "@/domain/entities/trust";
import type { ListPage, ListPageOptions } from "@/application/common/list-page";

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
  /**
   * Paginated inbox (newest first). Defaults to a bounded page when options omitted.
   * `unreadOnly` kept as second arg for call-site compatibility.
   */
  findByUserId(
    userId: string,
    unreadOnly?: boolean,
    options?: ListPageOptions,
  ): Promise<ListPage<Notification>>;
  create(input: CreateNotificationInput): Promise<Notification>;
  markRead(ids: string[], readAt?: Date): Promise<void>;
  markAllReadForUser(userId: string): Promise<void>;
}
