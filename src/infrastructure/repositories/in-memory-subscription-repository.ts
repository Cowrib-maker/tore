import { randomUUID } from "node:crypto";

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

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly seats = new Map<string, SubscriptionSeat>();

  clear(): void {
    this.subscriptions.clear();
    this.seats.clear();
  }

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    if (
      input.status === SubscriptionStatus.ACTIVE &&
      (input.planCode === SubscriptionPlanCode.SOLO ||
        input.planCode === SubscriptionPlanCode.CITIZEN_BASIC ||
        input.planCode === SubscriptionPlanCode.CITIZEN_PLUS)
    ) {
      const conflict = [...this.subscriptions.values()].some(
        (item) =>
          item.ownerUserId === input.ownerUserId &&
          item.planCode === input.planCode &&
          item.status === SubscriptionStatus.ACTIVE,
      );
      if (conflict) {
        throw new DuplicateActiveSoloError();
      }
    }
    const now = new Date();
    const record: Subscription = {
      id: randomUUID(),
      ownerUserId: input.ownerUserId,
      planCode: input.planCode,
      status: input.status,
      seatLimit: input.seatLimit,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      providerInvoiceId: input.providerInvoiceId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.subscriptions.set(record.id, record);
    return clone(record);
  }

  async findById(id: string): Promise<Subscription | null> {
    const record = this.subscriptions.get(id);
    return record ? clone(record) : null;
  }

  async findActiveOwnedByUserId(userId: string): Promise<Subscription | null> {
    const now = Date.now();
    const record = [...this.subscriptions.values()].find(
      (item) =>
        item.ownerUserId === userId &&
        item.status === SubscriptionStatus.ACTIVE &&
        item.currentPeriodEnd.getTime() > now,
    );
    return record ? clone(record) : null;
  }

  async findLatestOwnedByUserId(
    userId: string,
    planCode: SubscriptionPlanCode = SubscriptionPlanCode.SOLO,
  ): Promise<Subscription | null> {
    const record = [...this.subscriptions.values()]
      .filter(
        (item) => item.ownerUserId === userId && item.planCode === planCode,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return record ? clone(record) : null;
  }

  async findActiveSeatForUser(userId: string): Promise<{
    subscription: Subscription;
    seat: SubscriptionSeat;
  } | null> {
    const now = Date.now();
    for (const seat of this.seats.values()) {
      if (seat.userId !== userId || seat.status !== SeatStatus.ACTIVE) continue;
      const subscription = this.subscriptions.get(seat.subscriptionId);
      if (
        !subscription ||
        subscription.status !== SubscriptionStatus.ACTIVE ||
        subscription.currentPeriodEnd.getTime() <= now
      ) {
        continue;
      }
      return { subscription: clone(subscription), seat: clone(seat) };
    }
    return null;
  }

  async createSeat(input: CreateSeatInput): Promise<SubscriptionSeat> {
    const record: SubscriptionSeat = {
      id: randomUUID(),
      subscriptionId: input.subscriptionId,
      userId: input.userId,
      status: input.status ?? SeatStatus.ACTIVE,
      assignedAt: new Date(),
      revokedAt: null,
    };
    this.seats.set(record.id, record);
    return clone(record);
  }

  async listSeats(subscriptionId: string): Promise<SubscriptionSeat[]> {
    return [...this.seats.values()]
      .filter((seat) => seat.subscriptionId === subscriptionId)
      .map((seat) => clone(seat));
  }

  async updateStatus(
    id: string,
    status: SubscriptionStatus,
  ): Promise<Subscription> {
    const current = this.subscriptions.get(id);
    if (!current) throw new Error("Subscription not found");
    const next = { ...current, status, updatedAt: new Date() };
    this.subscriptions.set(id, next);
    return clone(next);
  }

  async updatePeriod(
    id: string,
    input: UpdateSubscriptionPeriodInput,
  ): Promise<Subscription> {
    const current = this.subscriptions.get(id);
    if (!current) throw new Error("Subscription not found");
    const next: Subscription = {
      ...current,
      status: input.status,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      providerInvoiceId:
        input.providerInvoiceId !== undefined
          ? input.providerInvoiceId
          : current.providerInvoiceId,
      updatedAt: new Date(),
    };
    this.subscriptions.set(id, next);
    return clone(next);
  }

  async revokeSeat(seatId: string, revokedAt: Date): Promise<SubscriptionSeat> {
    const current = this.seats.get(seatId);
    if (!current) throw new Error("Seat not found");
    const next: SubscriptionSeat = {
      ...current,
      status: SeatStatus.REVOKED,
      revokedAt,
    };
    this.seats.set(seatId, next);
    return clone(next);
  }
}
