import type { NotificationType } from "@/domain/enums";

export interface Review {
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
}

export interface CreateReviewInput {
  bookingId: string;
  clientUserId: string;
  lawyerProfileId: string;
  rating: number;
  comment?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}
