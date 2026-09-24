import {
  BILLING_PROVIDER_QPAY,
  InvoiceStatus,
  PaymentTransactionStatus,
} from "@/domain/enums";
import type { SubscriptionPlanCode, SubscriptionStatus } from "@/domain/enums";
import type {
  AdminEntitlementListInput,
  AdminEntitlementListResult,
  AdminInvoiceListInput,
  AdminInvoiceListResult,
  AdminPaymentDashboardTotals,
  AdminPaymentRepository,
  AdminPaymentTransactionListInput,
  AdminPaymentTransactionListResult,
  AdminSubscriptionListInput,
  AdminSubscriptionListResult,
  QpayActivitySummary,
  UserPaymentTrace,
} from "@/domain/repositories/admin-payment-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

function startOfDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function userSearchWhere(userSearch: string | undefined) {
  if (!userSearch) return {};
  return {
    user: {
      OR: [
        { email: { contains: userSearch, mode: "insensitive" as const } },
        { name: { contains: userSearch, mode: "insensitive" as const } },
      ],
    },
  };
}

export class PrismaAdminPaymentRepository implements AdminPaymentRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async getDashboardTotals(now: Date): Promise<AdminPaymentDashboardTotals> {
    const today = startOfDayUtc(now);
    const monthStart = startOfMonthUtc(now);

    const [
      totalAgg,
      todayAgg,
      monthAgg,
      paidInvoiceCount,
      pendingInvoiceCount,
      failedInvoiceCount,
      expiredInvoiceCount,
      cancelledInvoiceCount,
      totalTransactionCount,
    ] = await Promise.all([
      this.db.paymentTransaction.aggregate({
        where: { status: PaymentTransactionStatus.PAID },
        _sum: { amountMnt: true },
      }),
      this.db.paymentTransaction.aggregate({
        where: { status: PaymentTransactionStatus.PAID, paidAt: { gte: today } },
        _sum: { amountMnt: true },
      }),
      this.db.paymentTransaction.aggregate({
        where: { status: PaymentTransactionStatus.PAID, paidAt: { gte: monthStart } },
        _sum: { amountMnt: true },
      }),
      this.db.invoice.count({ where: { status: InvoiceStatus.PAID } }),
      this.db.invoice.count({
        where: {
          status: { in: [InvoiceStatus.PENDING, InvoiceStatus.AWAITING_VERIFICATION] },
        },
      }),
      this.db.invoice.count({ where: { status: InvoiceStatus.FAILED } }),
      this.db.invoice.count({ where: { status: InvoiceStatus.EXPIRED } }),
      this.db.invoice.count({ where: { status: InvoiceStatus.CANCELLED } }),
      this.db.paymentTransaction.count(),
    ]);

    return {
      totalRevenueMnt: totalAgg._sum.amountMnt ?? 0,
      todayRevenueMnt: todayAgg._sum.amountMnt ?? 0,
      monthRevenueMnt: monthAgg._sum.amountMnt ?? 0,
      paidInvoiceCount,
      pendingInvoiceCount,
      failedInvoiceCount,
      expiredInvoiceCount,
      cancelledInvoiceCount,
      totalTransactionCount,
    };
  }

  async listInvoices(input: AdminInvoiceListInput): Promise<AdminInvoiceListResult> {
    const where = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.planCode ? { planCode: input.planCode } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            createdAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
      ...userSearchWhere(input.userSearch),
    };

    const [records, total] = await Promise.all([
      this.db.invoice.findMany({
        where,
        include: {
          user: { select: { email: true, name: true } },
          payments: { select: { providerPaymentId: true, paidAt: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      }),
      this.db.invoice.count({ where }),
    ]);

    return {
      items: records.map((record) => ({
        id: record.id,
        userId: record.userId,
        userEmail: record.user?.email ?? null,
        userName: record.user?.name ?? null,
        planCode: record.planCode as SubscriptionPlanCode | null,
        amountMnt: record.amountMnt,
        currency: record.currency,
        provider: record.provider,
        providerInvoiceId: record.providerInvoiceId,
        status: record.status as InvoiceStatus,
        createdAt: record.createdAt,
        paymentProviderPaymentId: record.payments[0]?.providerPaymentId ?? null,
        paymentPaidAt: record.payments[0]?.paidAt ?? null,
        verifiedByUserId: record.verifiedByUserId,
        verifiedAt: record.verifiedAt,
        rejectionReason: record.rejectionReason,
        paymentCode: record.paymentCode,
      })),
      total,
    };
  }

  async listPaymentTransactions(
    input: AdminPaymentTransactionListInput,
  ): Promise<AdminPaymentTransactionListResult> {
    const where = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            createdAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
      ...(input.userSearch
        ? {
            invoice: {
              user: {
                OR: [
                  { email: { contains: input.userSearch, mode: "insensitive" as const } },
                  { name: { contains: input.userSearch, mode: "insensitive" as const } },
                ],
              },
            },
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.db.paymentTransaction.findMany({
        where,
        include: {
          invoice: {
            select: {
              userId: true,
              planCode: true,
              user: { select: { email: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      }),
      this.db.paymentTransaction.count({ where }),
    ]);

    return {
      items: records.map((record) => ({
        id: record.id,
        invoiceId: record.invoiceId,
        userId: record.invoice?.userId ?? null,
        userEmail: record.invoice?.user?.email ?? null,
        planCode: (record.invoice?.planCode ?? null) as SubscriptionPlanCode | null,
        provider: record.provider,
        providerPaymentId: record.providerPaymentId,
        amountMnt: record.amountMnt,
        currency: record.currency,
        status: record.status as PaymentTransactionStatus,
        paidAt: record.paidAt,
        createdAt: record.createdAt,
      })),
      total,
    };
  }

  async listSubscriptions(
    input: AdminSubscriptionListInput,
  ): Promise<AdminSubscriptionListResult> {
    const where = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.planCode ? { planCode: input.planCode } : {}),
      ...(input.userSearch
        ? {
            owner: {
              OR: [
                { email: { contains: input.userSearch, mode: "insensitive" as const } },
                { name: { contains: input.userSearch, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.db.subscription.findMany({
        where,
        include: { owner: { select: { email: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      }),
      this.db.subscription.count({ where }),
    ]);

    return {
      items: records.map((record) => ({
        id: record.id,
        ownerUserId: record.ownerUserId,
        userEmail: record.owner?.email ?? null,
        userName: record.owner?.name ?? null,
        planCode: record.planCode as SubscriptionPlanCode,
        status: record.status as SubscriptionStatus,
        seatLimit: record.seatLimit,
        currentPeriodStart: record.currentPeriodStart,
        currentPeriodEnd: record.currentPeriodEnd,
        providerInvoiceId: record.providerInvoiceId,
        createdAt: record.createdAt,
      })),
      total,
    };
  }

  async listEntitlements(
    input: AdminEntitlementListInput,
  ): Promise<AdminEntitlementListResult> {
    const where = {
      subscriptionId: { not: null },
      ...(input.userSearch
        ? {
            user: {
              OR: [
                { email: { contains: input.userSearch, mode: "insensitive" as const } },
                { name: { contains: input.userSearch, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
      ...(input.activeOnly
        ? {
            subscription: {
              is: {
                status: "ACTIVE" as const,
                currentPeriodEnd: { gt: new Date() },
              },
            },
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.db.entitlementUsage.findMany({
        where,
        include: {
          user: { select: { email: true, name: true } },
          subscription: {
            select: { id: true, planCode: true, status: true, currentPeriodEnd: true },
          },
        },
        orderBy: { periodStart: "desc" },
        take: input.limit,
        skip: input.offset,
      }),
      this.db.entitlementUsage.count({ where }),
    ]);

    return {
      items: records.map((record) => ({
        userId: record.userId,
        userEmail: record.user?.email ?? null,
        userName: record.user?.name ?? null,
        subscriptionId: record.subscriptionId,
        planCode: (record.subscription?.planCode ?? null) as SubscriptionPlanCode | null,
        subscriptionStatus: (record.subscription?.status ?? null) as SubscriptionStatus | null,
        currentPeriodEnd: record.subscription?.currentPeriodEnd ?? null,
        periodStart: record.periodStart,
        caseAnalysisCount: record.caseAnalysisCount,
        documentAnalysisCount: record.documentAnalysisCount,
        legalAiQueryCount: record.legalAiQueryCount,
      })),
      total,
    };
  }

  async getUserPaymentTrace(userId: string): Promise<UserPaymentTrace | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) return null;

    const [subscriptions, invoices] = await Promise.all([
      this.db.subscription.findMany({
        where: { ownerUserId: userId },
        orderBy: { createdAt: "desc" },
      }),
      this.db.invoice.findMany({
        where: { userId },
        include: { payments: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const invoicesBySubscription = new Map<string, typeof invoices>();
    const unlinked: typeof invoices = [];
    for (const invoice of invoices) {
      if (invoice.subscriptionId) {
        const list = invoicesBySubscription.get(invoice.subscriptionId) ?? [];
        list.push(invoice);
        invoicesBySubscription.set(invoice.subscriptionId, list);
      } else {
        unlinked.push(invoice);
      }
    }

    function mapInvoice(record: (typeof invoices)[number]) {
      const payment = record.payments[0] ?? null;
      return {
        id: record.id,
        amountMnt: record.amountMnt,
        currency: record.currency,
        provider: record.provider,
        providerInvoiceId: record.providerInvoiceId,
        status: record.status as InvoiceStatus,
        createdAt: record.createdAt,
        verifiedByUserId: record.verifiedByUserId,
        verifiedAt: record.verifiedAt,
        rejectionReason: record.rejectionReason,
        paymentCode: record.paymentCode,
        payment: payment
          ? {
              providerPaymentId: payment.providerPaymentId,
              status: payment.status as PaymentTransactionStatus,
              paidAt: payment.paidAt,
            }
          : null,
      };
    }

    return {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription.id,
        planCode: subscription.planCode as SubscriptionPlanCode,
        status: subscription.status as SubscriptionStatus,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        createdAt: subscription.createdAt,
        invoices: (invoicesBySubscription.get(subscription.id) ?? []).map(mapInvoice),
      })),
      unlinkedInvoices: unlinked.map(mapInvoice),
    };
  }

  async getQpayActivitySummary(now: Date): Promise<QpayActivitySummary> {
    const [lastInvoice, lastPayment, paidCount, failedCount, pendingCount] =
      await Promise.all([
        this.db.invoice.findFirst({
          where: { provider: BILLING_PROVIDER_QPAY },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        this.db.paymentTransaction.findFirst({
          where: { provider: BILLING_PROVIDER_QPAY, status: PaymentTransactionStatus.PAID },
          orderBy: { paidAt: "desc" },
          select: { paidAt: true },
        }),
        this.db.invoice.count({
          where: { provider: BILLING_PROVIDER_QPAY, status: InvoiceStatus.PAID },
        }),
        this.db.invoice.count({
          where: { provider: BILLING_PROVIDER_QPAY, status: InvoiceStatus.FAILED },
        }),
        this.db.invoice.count({
          where: { provider: BILLING_PROVIDER_QPAY, status: InvoiceStatus.PENDING },
        }),
      ]);

    void now;
    return {
      lastInvoiceCreatedAt: lastInvoice?.createdAt ?? null,
      lastPaymentPaidAt: lastPayment?.paidAt ?? null,
      paidInvoiceCount: paidCount,
      failedInvoiceCount: failedCount,
      pendingInvoiceCount: pendingCount,
    };
  }
}

export const adminPaymentRepository = new PrismaAdminPaymentRepository();
