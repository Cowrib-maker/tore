import type {
  AttachProviderInvoiceInput,
  CreateInvoiceInput,
  Invoice,
  InvoiceDeeplink,
} from "@/domain/entities/invoice";
import { InvoiceStatus } from "@/domain/enums";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

function asDeeplinks(value: unknown): InvoiceDeeplink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.name !== "string" ||
      typeof row.description !== "string" ||
      typeof row.logo !== "string" ||
      typeof row.link !== "string"
    ) {
      return [];
    }
    return [
      {
        name: row.name,
        description: row.description,
        logo: row.logo,
        link: row.link,
      },
    ];
  });
}

function mapInvoice(record: {
  id: string;
  userId: string;
  subscriptionId: string | null;
  bookingId: string | null;
  planCode: string | null;
  amountMnt: number;
  currency: string;
  provider: string;
  providerInvoiceId: string | null;
  status: string;
  expiresAt: Date;
  qrText: string | null;
  qrImage: string | null;
  shortUrl: string | null;
  deeplinksJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Invoice {
  return {
    id: record.id,
    userId: record.userId,
    subscriptionId: record.subscriptionId,
    bookingId: record.bookingId,
    planCode: record.planCode as Invoice["planCode"],
    amountMnt: record.amountMnt,
    currency: record.currency,
    provider: record.provider,
    providerInvoiceId: record.providerInvoiceId,
    status: record.status as InvoiceStatus,
    expiresAt: record.expiresAt,
    qrText: record.qrText,
    qrImage: record.qrImage,
    shortUrl: record.shortUrl,
    deeplinks: asDeeplinks(record.deeplinksJson),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class PrismaInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    const record = await this.db.invoice.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        userId: input.userId,
        subscriptionId: input.subscriptionId ?? null,
        bookingId: input.bookingId ?? null,
        planCode: input.planCode ?? null,
        amountMnt: input.amountMnt,
        currency: input.currency,
        provider: input.provider,
        status: input.status,
        expiresAt: input.expiresAt,
      },
    });
    return mapInvoice(record);
  }

  async findById(id: string): Promise<Invoice | null> {
    const record = await this.db.invoice.findUnique({ where: { id } });
    return record ? mapInvoice(record) : null;
  }

  async findByProviderInvoiceId(
    providerInvoiceId: string,
  ): Promise<Invoice | null> {
    const record = await this.db.invoice.findUnique({
      where: { providerInvoiceId },
    });
    return record ? mapInvoice(record) : null;
  }

  async findByBookingId(bookingId: string): Promise<Invoice | null> {
    const record = await this.db.invoice.findUnique({
      where: { bookingId },
    });
    return record ? mapInvoice(record) : null;
  }

  async findLatestPendingForUser(
    userId: string,
    now: Date,
  ): Promise<Invoice | null> {
    const record = await this.db.invoice.findFirst({
      where: {
        userId,
        status: InvoiceStatus.PENDING,
        expiresAt: { gt: now },
        providerInvoiceId: { not: null },
        bookingId: null,
      },
      orderBy: { createdAt: "desc" },
    });
    return record ? mapInvoice(record) : null;
  }

  async listByUserId(userId: string): Promise<Invoice[]> {
    const records = await this.db.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return records.map(mapInvoice);
  }

  async attachProviderInvoice(
    id: string,
    input: AttachProviderInvoiceInput,
  ): Promise<Invoice> {
    const record = await this.db.invoice.update({
      where: { id },
      data: {
        providerInvoiceId: input.providerInvoiceId,
        qrText: input.qrText,
        qrImage: input.qrImage,
        shortUrl: input.shortUrl,
        deeplinksJson: input.deeplinks,
      },
    });
    return mapInvoice(record);
  }

  async updateStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
    const record = await this.db.invoice.update({
      where: { id },
      data: { status },
    });
    return mapInvoice(record);
  }

  async linkSubscription(id: string, subscriptionId: string): Promise<Invoice> {
    const record = await this.db.invoice.update({
      where: { id },
      data: { subscriptionId },
    });
    return mapInvoice(record);
  }
}

export const invoiceRepository = new PrismaInvoiceRepository();
