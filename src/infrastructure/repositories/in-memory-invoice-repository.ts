import { randomUUID } from "node:crypto";

import type {
  AttachProviderInvoiceInput,
  CreateInvoiceInput,
  CreatePaymentTransactionInput,
  Invoice,
  PaymentTransaction,
} from "@/domain/entities/invoice";
import { InvoiceStatus } from "@/domain/enums";
import {
  DuplicatePaymentError,
  type InvoiceRepository,
  type PaymentTransactionRepository,
} from "@/domain/repositories/invoice-repository";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly invoices = new Map<string, Invoice>();

  clear(): void {
    this.invoices.clear();
  }

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    const now = new Date();
    const record: Invoice = {
      id: input.id ?? randomUUID(),
      userId: input.userId,
      subscriptionId: input.subscriptionId ?? null,
      planCode: input.planCode,
      amountMnt: input.amountMnt,
      currency: input.currency,
      provider: input.provider,
      providerInvoiceId: null,
      status: input.status,
      expiresAt: input.expiresAt,
      qrText: null,
      qrImage: null,
      shortUrl: null,
      deeplinks: [],
      createdAt: now,
      updatedAt: now,
    };
    this.invoices.set(record.id, record);
    return clone(record);
  }

  async findById(id: string): Promise<Invoice | null> {
    const record = this.invoices.get(id);
    return record ? clone(record) : null;
  }

  async findByProviderInvoiceId(
    providerInvoiceId: string,
  ): Promise<Invoice | null> {
    const record = [...this.invoices.values()].find(
      (item) => item.providerInvoiceId === providerInvoiceId,
    );
    return record ? clone(record) : null;
  }

  async findLatestPendingForUser(
    userId: string,
    now: Date,
  ): Promise<Invoice | null> {
    const record = [...this.invoices.values()]
      .filter(
        (item) =>
          item.userId === userId &&
          item.status === InvoiceStatus.PENDING &&
          item.expiresAt.getTime() > now.getTime() &&
          Boolean(item.providerInvoiceId),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return record ? clone(record) : null;
  }

  async listByUserId(userId: string): Promise<Invoice[]> {
    return [...this.invoices.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((item) => clone(item));
  }

  async attachProviderInvoice(
    id: string,
    input: AttachProviderInvoiceInput,
  ): Promise<Invoice> {
    const current = this.invoices.get(id);
    if (!current) throw new Error("Invoice not found");
    const duplicate = [...this.invoices.values()].find(
      (item) =>
        item.id !== id && item.providerInvoiceId === input.providerInvoiceId,
    );
    if (duplicate) {
      throw new DuplicatePaymentError("Duplicate provider invoice id");
    }
    const next: Invoice = {
      ...current,
      providerInvoiceId: input.providerInvoiceId,
      qrText: input.qrText,
      qrImage: input.qrImage,
      shortUrl: input.shortUrl,
      deeplinks: input.deeplinks,
      updatedAt: new Date(),
    };
    this.invoices.set(id, next);
    return clone(next);
  }

  async updateStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
    const current = this.invoices.get(id);
    if (!current) throw new Error("Invoice not found");
    const next = { ...current, status, updatedAt: new Date() };
    this.invoices.set(id, next);
    return clone(next);
  }

  async linkSubscription(id: string, subscriptionId: string): Promise<Invoice> {
    const current = this.invoices.get(id);
    if (!current) throw new Error("Invoice not found");
    const next = { ...current, subscriptionId, updatedAt: new Date() };
    this.invoices.set(id, next);
    return clone(next);
  }
}

export class InMemoryPaymentTransactionRepository
  implements PaymentTransactionRepository
{
  private readonly payments = new Map<string, PaymentTransaction>();

  clear(): void {
    this.payments.clear();
  }

  async create(
    input: CreatePaymentTransactionInput,
  ): Promise<PaymentTransaction> {
    if (
      [...this.payments.values()].some(
        (item) =>
          item.invoiceId === input.invoiceId ||
          item.providerPaymentId === input.providerPaymentId,
      )
    ) {
      throw new DuplicatePaymentError();
    }
    const now = new Date();
    const record: PaymentTransaction = {
      id: randomUUID(),
      invoiceId: input.invoiceId,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      amountMnt: input.amountMnt,
      currency: input.currency,
      status: input.status,
      paidAt: input.paidAt,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.payments.set(record.id, record);
    return clone(record);
  }

  async findByInvoiceId(invoiceId: string): Promise<PaymentTransaction | null> {
    const record = [...this.payments.values()].find(
      (item) => item.invoiceId === invoiceId,
    );
    return record ? clone(record) : null;
  }

  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<PaymentTransaction | null> {
    const record = [...this.payments.values()].find(
      (item) => item.providerPaymentId === providerPaymentId,
    );
    return record ? clone(record) : null;
  }
}
