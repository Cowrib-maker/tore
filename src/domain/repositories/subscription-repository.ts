import type {
  CreateSeatInput,
  CreateSubscriptionInput,
  Subscription,
  SubscriptionSeat,
} from "@/domain/entities/subscription";
import type { SubscriptionPlanCode, SubscriptionStatus } from "@/domain/enums";

export class DuplicateActiveSoloError extends Error {
  constructor(message = "An ACTIVE SOLO subscription already exists for this owner") {
    super(message);
    this.name = "DuplicateActiveSoloError";
  }
}

export type UpdateSubscriptionPeriodInput = {
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  providerInvoiceId?: string | null;
};

export interface SubscriptionRepository {
  create(input: CreateSubscriptionInput): Promise<Subscription>;
  findById(id: string): Promise<Subscription | null>;
  findActiveOwnedByUserId(userId: string): Promise<Subscription | null>;
  findLatestOwnedByUserId(
    userId: string,
    planCode?: SubscriptionPlanCode,
  ): Promise<Subscription | null>;
  findActiveSeatForUser(userId: string): Promise<{
    subscription: Subscription;
    seat: SubscriptionSeat;
  } | null>;
  createSeat(input: CreateSeatInput): Promise<SubscriptionSeat>;
  listSeats(subscriptionId: string): Promise<SubscriptionSeat[]>;
  updateStatus(id: string, status: SubscriptionStatus): Promise<Subscription>;
  updatePeriod(
    id: string,
    input: UpdateSubscriptionPeriodInput,
  ): Promise<Subscription>;
  revokeSeat(seatId: string, revokedAt: Date): Promise<SubscriptionSeat>;
}
