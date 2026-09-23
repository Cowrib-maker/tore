import { beforeEach, describe, expect, it } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import { claimManualPayment } from "@/application/use-cases/billing/claim-manual-payment";
import {
  createManualCitizenCheckout,
  createManualLawyerCheckout,
} from "@/application/use-cases/billing/create-manual-checkout";
import { listManualPayments } from "@/application/use-cases/billing/list-manual-payments";
import { rejectManualPayment } from "@/application/use-cases/billing/reject-manual-payment";
import { verifyManualPayment } from "@/application/use-cases/billing/verify-manual-payment";
import {
  BILLING_PROVIDER_MANUAL_BANK_TRANSFER,
  BILLING_PROVIDER_MANUAL_QR,
  BILLING_PROVIDER_QPAY,
  InvoiceStatus,
  SeatStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
  UserRole,
} from "@/domain/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type { ManualPaymentConfig } from "@/infrastructure/billing/manual/manual-payment-config";
import { InMemoryBillingUnitOfWork } from "@/infrastructure/database/in-memory-billing-unit-of-work";
import {
  InMemoryInvoiceRepository,
  InMemoryPaymentTransactionRepository,
} from "@/infrastructure/repositories/in-memory-invoice-repository";
import { InMemorySubscriptionRepository } from "@/infrastructure/repositories/in-memory-subscription-repository";
import type { User } from "@/domain/entities/user";
import type { UserRepository } from "@/domain/repositories/user-repository";

const lawyer: ActorContext = { userId: "lawyer-1", role: UserRole.LAWYER };
const otherLawyer: ActorContext = { userId: "lawyer-2", role: UserRole.LAWYER };
const client: ActorContext = { userId: "client-1", role: UserRole.CLIENT };
const admin: ActorContext = { userId: "admin-1", role: UserRole.ADMIN };
const now = new Date("2026-08-22T12:00:00.000Z");

const ENABLED_CONFIG: ManualPaymentConfig = {
  enabled: true,
  bankName: "Төрийн банк",
  bankAccountNumber: "123456789",
  bankAccountName: "TORE LLC",
  qrAssetUrl: "/brand/qpay-qr.png",
};

function stubUserRepository(users: Partial<User>[]): UserRepository {
  return {
    findById: async (id: string) => (users.find((u) => u.id === id) as User) ?? null,
    findByIds: async (ids: string[]) => users.filter((u) => ids.includes(u.id!)) as User[],
  } as unknown as UserRepository;
}

describe("manual payment lifecycle", () => {
  let invoices: InMemoryInvoiceRepository;
  let payments: InMemoryPaymentTransactionRepository;
  let subscriptions: InMemorySubscriptionRepository;
  let billingUnitOfWork: InMemoryBillingUnitOfWork;

  beforeEach(() => {
    invoices = new InMemoryInvoiceRepository();
    payments = new InMemoryPaymentTransactionRepository();
    subscriptions = new InMemorySubscriptionRepository();
    billingUnitOfWork = new InMemoryBillingUnitOfWork({
      invoiceRepository: invoices,
      paymentTransactionRepository: payments,
      subscriptionRepository: subscriptions,
    });
  });

  describe("createManualLawyerCheckout / createManualCitizenCheckout", () => {
    it("creates a PENDING bank-transfer invoice with a synthetic reference for a lawyer", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      expect(view.status).toBe(InvoiceStatus.PENDING);
      expect(view.amountMnt).toBe(49_000);
      expect(view.reference).toMatch(/^TORE-[A-Z0-9]{8}$/);
      expect(view.bankName).toBe("Төрийн банк");
      expect(view.qrAssetUrl).toBeNull();

      const stored = await invoices.findById(view.invoiceId);
      expect(stored?.provider).toBe(BILLING_PROVIDER_MANUAL_BANK_TRANSFER);
      expect(stored?.providerInvoiceId).toBe(view.reference);
    });

    it("creates a QR invoice for a citizen plan, distinct provider from bank transfer", async () => {
      const view = await createManualCitizenCheckout(
        client,
        SubscriptionPlanCode.CITIZEN_BASIC,
        "QR",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      expect(view.qrAssetUrl).toBe("/brand/qpay-qr.png");
      expect(view.bankName).toBeNull();

      const stored = await invoices.findById(view.invoiceId);
      expect(stored?.provider).toBe(BILLING_PROVIDER_MANUAL_QR);
    });

    it("reuses an existing unexpired PENDING invoice for the same plan+method instead of creating a duplicate", async () => {
      const first = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      const second = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        new Date(now.getTime() + 1000),
      );
      expect(second.invoiceId).toBe(first.invoiceId);
      expect((await invoices.listByUserId(lawyer.userId)).length).toBe(1);
    });

    it("does not reuse a different method's invoice — QR and bank transfer stay independent", async () => {
      const bank = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      const qr = await createManualLawyerCheckout(
        lawyer,
        "QR",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      expect(qr.invoiceId).not.toBe(bank.invoiceId);
    });

    it("refuses when manual payment is disabled by config", async () => {
      await expect(
        createManualLawyerCheckout(
          lawyer,
          "BANK_TRANSFER",
          { invoiceRepository: invoices, manualPaymentConfig: { ...ENABLED_CONFIG, enabled: false } },
          now,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects a client actor from the lawyer checkout and vice versa", async () => {
      await expect(
        createManualLawyerCheckout(
          client,
          "BANK_TRANSFER",
          { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
          now,
        ),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        createManualCitizenCheckout(
          lawyer,
          SubscriptionPlanCode.CITIZEN_BASIC,
          "BANK_TRANSFER",
          { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
          now,
        ),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("claimManualPayment — 'Төлбөр хийсэн', never activates entitlement", () => {
    it("moves PENDING to AWAITING_VERIFICATION", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      const claimed = await claimManualPayment(lawyer, view.invoiceId, { invoiceRepository: invoices }, now);
      expect(claimed.status).toBe(InvoiceStatus.AWAITING_VERIFICATION);

      const subscription = await subscriptions.findLatestOwnedByUserId(lawyer.userId, SubscriptionPlanCode.SOLO);
      expect(subscription).toBeNull();
    });

    it("is idempotent — claiming an already-AWAITING_VERIFICATION invoice again is a no-op, not an error", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      await claimManualPayment(lawyer, view.invoiceId, { invoiceRepository: invoices }, now);
      const second = await claimManualPayment(lawyer, view.invoiceId, { invoiceRepository: invoices }, now);
      expect(second.status).toBe(InvoiceStatus.AWAITING_VERIFICATION);
    });

    it("refuses a claim from a different user than the invoice owner", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      await expect(
        claimManualPayment(otherLawyer, view.invoiceId, { invoiceRepository: invoices }, now),
      ).rejects.toThrow(ForbiddenError);
    });

    it("refuses to claim a nonexistent invoice", async () => {
      await expect(
        claimManualPayment(lawyer, "does-not-exist", { invoiceRepository: invoices }, now),
      ).rejects.toThrow(NotFoundError);
    });

    it("refuses to claim a QPay invoice — claim only applies to manual providers", async () => {
      const qpayInvoice = await invoices.create({
        userId: lawyer.userId,
        planCode: SubscriptionPlanCode.SOLO,
        amountMnt: 49_000,
        currency: "MNT",
        provider: BILLING_PROVIDER_QPAY,
        status: InvoiceStatus.PENDING,
        expiresAt: new Date(now.getTime() + 60_000),
      });
      await expect(
        claimManualPayment(lawyer, qpayInvoice.id, { invoiceRepository: invoices }, now),
      ).rejects.toThrow(ValidationError);
    });

    it("refuses to claim an expired invoice", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      const later = new Date(new Date(view.expiresAt).getTime() + 1000);
      await expect(
        claimManualPayment(lawyer, view.invoiceId, { invoiceRepository: invoices }, later),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("verifyManualPayment — admin approval activates the SAME shared entitlement path QPay uses", () => {
    it("PAID + creates a PaymentTransaction + activates an ACTIVE subscription with a seat", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      await claimManualPayment(lawyer, view.invoiceId, { invoiceRepository: invoices }, now);

      const result = await verifyManualPayment(admin, view.invoiceId, { billingUnitOfWork }, now);
      expect(result.alreadyProcessed).toBe(false);
      expect(result.invoice.status).toBe(InvoiceStatus.PAID);
      expect(result.invoice.verifiedByUserId).toBe(admin.userId);
      expect(result.subscription?.status).toBe(SubscriptionStatus.ACTIVE);

      const seats = await subscriptions.listSeats(result.subscription!.id);
      expect(seats.some((s) => s.userId === lawyer.userId && s.status === SeatStatus.ACTIVE)).toBe(true);

      const payment = await payments.findByInvoiceId(view.invoiceId);
      expect(payment?.provider).toBe(BILLING_PROVIDER_MANUAL_BANK_TRANSFER);
      expect(payment?.status).toBe("PAID");
    });

    it("is idempotent — verifying an already-PAID invoice twice never double-activates or duplicates the PaymentTransaction", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      await claimManualPayment(lawyer, view.invoiceId, { invoiceRepository: invoices }, now);
      const first = await verifyManualPayment(admin, view.invoiceId, { billingUnitOfWork }, now);
      const second = await verifyManualPayment(admin, view.invoiceId, { billingUnitOfWork }, now);

      expect(second.alreadyProcessed).toBe(true);
      expect(second.subscription?.id).toBe(first.subscription?.id);
      expect(second.subscription?.currentPeriodEnd.getTime()).toBe(first.subscription?.currentPeriodEnd.getTime());
    });

    it("refuses to verify a PENDING invoice (must be AWAITING_VERIFICATION first)", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      await expect(verifyManualPayment(admin, view.invoiceId, { billingUnitOfWork }, now)).rejects.toThrow(
        ValidationError,
      );
    });

    it("refuses a non-admin actor", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      await claimManualPayment(lawyer, view.invoiceId, { invoiceRepository: invoices }, now);
      await expect(verifyManualPayment(lawyer, view.invoiceId, { billingUnitOfWork }, now)).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("refuses to verify a QPay invoice through the manual path", async () => {
      const qpayInvoice = await invoices.create({
        userId: lawyer.userId,
        planCode: SubscriptionPlanCode.SOLO,
        amountMnt: 49_000,
        currency: "MNT",
        provider: BILLING_PROVIDER_QPAY,
        status: InvoiceStatus.AWAITING_VERIFICATION,
        expiresAt: new Date(now.getTime() + 60_000),
      });
      await expect(
        verifyManualPayment(admin, qpayInvoice.id, { billingUnitOfWork }, now),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("rejectManualPayment", () => {
    it("moves AWAITING_VERIFICATION to FAILED with a reason, never touches subscription state", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      await claimManualPayment(lawyer, view.invoiceId, { invoiceRepository: invoices }, now);
      const rejected = await rejectManualPayment(
        admin,
        view.invoiceId,
        "Гүйлгээ олдсонгүй",
        { invoiceRepository: invoices },
        now,
      );
      expect(rejected.status).toBe(InvoiceStatus.FAILED);
      expect(rejected.rejectionReason).toBe("Гүйлгээ олдсонгүй");
      expect(rejected.verifiedByUserId).toBe(admin.userId);

      const subscription = await subscriptions.findLatestOwnedByUserId(lawyer.userId, SubscriptionPlanCode.SOLO);
      expect(subscription).toBeNull();
    });

    it("requires a non-empty reason", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      await claimManualPayment(lawyer, view.invoiceId, { invoiceRepository: invoices }, now);
      await expect(
        rejectManualPayment(admin, view.invoiceId, "   ", { invoiceRepository: invoices }, now),
      ).rejects.toThrow(ValidationError);
    });

    it("is idempotent — rejecting an already-FAILED invoice again returns it unchanged rather than erroring", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      await claimManualPayment(lawyer, view.invoiceId, { invoiceRepository: invoices }, now);
      await rejectManualPayment(admin, view.invoiceId, "no match", { invoiceRepository: invoices }, now);
      const second = await rejectManualPayment(admin, view.invoiceId, "no match again", { invoiceRepository: invoices }, now);
      expect(second.status).toBe(InvoiceStatus.FAILED);
      expect(second.rejectionReason).toBe("no match");
    });

    it("refuses a non-admin actor", async () => {
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      await claimManualPayment(lawyer, view.invoiceId, { invoiceRepository: invoices }, now);
      await expect(
        rejectManualPayment(lawyer, view.invoiceId, "no", { invoiceRepository: invoices }, now),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("listManualPayments — admin queue", () => {
    it("lists only manual-provider invoices matching the requested status, enriched with user email/name", async () => {
      const users = stubUserRepository([{ id: lawyer.userId, email: "lawyer@test.mn", name: "Lawyer One" } as User]);
      const view = await createManualLawyerCheckout(
        lawyer,
        "BANK_TRANSFER",
        { invoiceRepository: invoices, manualPaymentConfig: ENABLED_CONFIG },
        now,
      );
      await claimManualPayment(lawyer, view.invoiceId, { invoiceRepository: invoices }, now);
      // a QPay invoice in the same status must never appear in this admin queue
      await invoices.create({
        userId: lawyer.userId,
        planCode: SubscriptionPlanCode.SOLO,
        amountMnt: 49_000,
        currency: "MNT",
        provider: BILLING_PROVIDER_QPAY,
        status: InvoiceStatus.AWAITING_VERIFICATION,
        expiresAt: new Date(now.getTime() + 60_000),
      });

      const items = await listManualPayments(admin, InvoiceStatus.AWAITING_VERIFICATION, {
        invoiceRepository: invoices,
        userRepository: users,
      });
      expect(items).toHaveLength(1);
      expect(items[0]!.userEmail).toBe("lawyer@test.mn");
      expect(items[0]!.userName).toBe("Lawyer One");
    });

    it("refuses a non-admin actor", async () => {
      const users = stubUserRepository([]);
      await expect(
        listManualPayments(lawyer, InvoiceStatus.AWAITING_VERIFICATION, {
          invoiceRepository: invoices,
          userRepository: users,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
