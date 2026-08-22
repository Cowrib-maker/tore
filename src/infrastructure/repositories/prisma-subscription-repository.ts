import type {
  CreateSeatInput,
  CreateSubscriptionInput,
  Subscription,
  SubscriptionSeat,
} from "@/domain/entities/subscription";
import {
  SeatStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
} from "@/domain/enums";
import {
  DuplicateActiveSoloError,
  type SubscriptionRepository,
  type UpdateSubscriptionPeriodInput,
} from "@/domain/repositories/subscription-repository";
import { isPrismaUniqueViolation } from "@/infrastructure/database/prisma-errors";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import { mapSeat, mapSubscription } from "@/infrastructure/mappers/subscription.mapper";

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    try {
      const record = await this.db.subscription.create({
        data: {
          ownerUserId: input.ownerUserId,
          planCode: input.planCode,
          status: input.status,
          seatLimit: input.seatLimit,
          currentPeriodStart: input.currentPeriodStart,
          currentPeriodEnd: input.currentPeriodEnd,
          providerInvoiceId: input.providerInvoiceId ?? null,
        },
      });
      return mapSubscription(record);
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        throw new DuplicateActiveSoloError();
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Subscription | null> {
    const record = await this.db.subscription.findUnique({ where: { id } });
    return record ? mapSubscription(record) : null;
  }

  async findActiveOwnedByUserId(userId: string): Promise<Subscription | null> {
    const record = await this.db.subscription.findFirst({
      where: {
        ownerUserId: userId,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    return record ? mapSubscription(record) : null;
  }

  async findLatestOwnedByUserId(
    userId: string,
    planCode: SubscriptionPlanCode = SubscriptionPlanCode.SOLO,
  ): Promise<Subscription | null> {
    const record = await this.db.subscription.findFirst({
      where: { ownerUserId: userId, planCode },
      orderBy: { createdAt: "desc" },
    });
    return record ? mapSubscription(record) : null;
  }

  async findActiveSeatForUser(userId: string): Promise<{
    subscription: Subscription;
    seat: SubscriptionSeat;
  } | null> {
    const record = await this.db.subscriptionSeat.findFirst({
      where: {
        userId,
        status: SeatStatus.ACTIVE,
        subscription: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: { gt: new Date() },
        },
      },
      include: { subscription: true },
      orderBy: { assignedAt: "desc" },
    });
    if (!record) return null;
    return {
      subscription: mapSubscription(record.subscription),
      seat: mapSeat(record),
    };
  }

  async createSeat(input: CreateSeatInput): Promise<SubscriptionSeat> {
    const record = await this.db.subscriptionSeat.create({
      data: {
        subscriptionId: input.subscriptionId,
        userId: input.userId,
        status: input.status ?? SeatStatus.ACTIVE,
      },
    });
    return mapSeat(record);
  }

  async listSeats(subscriptionId: string): Promise<SubscriptionSeat[]> {
    const records = await this.db.subscriptionSeat.findMany({
      where: { subscriptionId },
      orderBy: { assignedAt: "asc" },
    });
    return records.map(mapSeat);
  }

  async updateStatus(
    id: string,
    status: SubscriptionStatus,
  ): Promise<Subscription> {
    const record = await this.db.subscription.update({
      where: { id },
      data: { status },
    });
    return mapSubscription(record);
  }

  async updatePeriod(
    id: string,
    input: UpdateSubscriptionPeriodInput,
  ): Promise<Subscription> {
    const record = await this.db.subscription.update({
      where: { id },
      data: {
        status: input.status,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        ...(input.providerInvoiceId !== undefined
          ? { providerInvoiceId: input.providerInvoiceId }
          : {}),
      },
    });
    return mapSubscription(record);
  }

  async revokeSeat(seatId: string, revokedAt: Date): Promise<SubscriptionSeat> {
    const record = await this.db.subscriptionSeat.update({
      where: { id: seatId },
      data: { status: SeatStatus.REVOKED, revokedAt },
    });
    return mapSeat(record);
  }
}

export const subscriptionRepository = new PrismaSubscriptionRepository();
