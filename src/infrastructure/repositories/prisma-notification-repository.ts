import type {
  CreateNotificationInput,
  Notification,
} from "@/domain/entities/trust";
import type { NotificationType } from "@/domain/enums";
import type { NotificationRepository } from "@/domain/repositories/trust-repository";
import type { ListPage, ListPageOptions } from "@/application/common/list-page";
import { resolveTake } from "@/application/common/list-page";
import type { Prisma } from "@/generated/prisma/client";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

type NotificationRecord = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
};

function mapNotification(record: NotificationRecord): Notification {
  return {
    id: record.id,
    userId: record.userId,
    type: record.type as NotificationType,
    title: record.title,
    body: record.body,
    metadata:
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : null,
    readAt: record.readAt,
    createdAt: record.createdAt,
  };
}

const notificationSelect = {
  id: true,
  userId: true,
  type: true,
  title: true,
  body: true,
  metadata: true,
  readAt: true,
  createdAt: true,
} as const;

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string): Promise<Notification | null> {
    const record = await this.db.notification.findUnique({
      where: { id },
      select: notificationSelect,
    });
    return record ? mapNotification(record) : null;
  }

  async findByUserId(
    userId: string,
    unreadOnly?: boolean,
    options?: ListPageOptions,
  ): Promise<ListPage<Notification>> {
    const take = resolveTake(options);
    const records = await this.db.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      take: take + 1,
      ...(options?.cursor
        ? { cursor: { id: options.cursor }, skip: 1 }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: notificationSelect,
    });
    const hasMore = records.length > take;
    const page = hasMore ? records.slice(0, take) : records;
    return {
      items: page.map(mapNotification),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }

  async create(input: CreateNotificationInput): Promise<Notification> {
    const record = await this.db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: (input.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
      select: notificationSelect,
    });
    return mapNotification(record);
  }

  async markRead(ids: string[], readAt: Date = new Date()): Promise<void> {
    if (ids.length === 0) return;
    await this.db.notification.updateMany({
      where: { id: { in: ids } },
      data: { readAt },
    });
  }

  async markAllReadForUser(userId: string): Promise<void> {
    await this.db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

export const notificationRepository = new PrismaNotificationRepository();
