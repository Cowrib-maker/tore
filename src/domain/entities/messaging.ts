export interface MessageThread {
  id: string;
  bookingId: string;
  createdAt: Date;
  closedAt: Date | null;
}

export interface Message {
  id: string;
  threadId: string;
  senderUserId: string;
  body: string;
  readAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: Date;
}

export interface CreateMessageInput {
  threadId: string;
  senderUserId: string;
  body: string;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    mimeType: string;
    fileSizeBytes: number;
  }>;
}

export interface CreateMessageThreadInput {
  bookingId: string;
}
