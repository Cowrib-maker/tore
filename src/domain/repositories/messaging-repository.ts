import type {
  CreateMessageInput,
  CreateMessageThreadInput,
  Message,
  MessageThread,
} from "@/domain/entities/messaging";

export interface MessageThreadRepository {
  findById(id: string): Promise<MessageThread | null>;
  findByBookingId(bookingId: string): Promise<MessageThread | null>;
  create(input: CreateMessageThreadInput): Promise<MessageThread>;
  close(id: string): Promise<MessageThread>;
}

export interface MessageRepository {
  findByThreadId(threadId: string): Promise<Message[]>;
  create(input: CreateMessageInput): Promise<Message>;
  markRead(messageIds: string[], readAt?: Date): Promise<void>;
}
