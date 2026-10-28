import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { processQpayInvoicePayment } from "@/application/use-cases/billing/process-qpay-payment";
import { listOwnerLicenses, revealLicenseCode } from "@/application/use-cases/spell/owner-licenses";
import { createSpellCheckout, fulfillSpellPurchase } from "@/application/use-cases/spell/purchase";
import { getOwnSpellPurchaseStatus } from "@/application/use-cases/spell/purchase-status";
import type { SpellAdminDeps } from "@/application/use-cases/spell/deps";
import { InvoiceStatus, UserRole } from "@/domain/enums";
import type { QpayCheckedPayment, QpayCreateInvoiceInput, QpayCreatedInvoice, QpayGateway } from "@/domain/ports/qpay-gateway";
import { DEFAULT_SPELL_POLICY } from "@/domain/spell/policy";
import { prisma } from "@/infrastructure/database/prisma";
import { PrismaBillingUnitOfWork } from "@/infrastructure/database/prisma-billing-unit-of-work";
import { PrismaSpellUnitOfWork } from "@/infrastructure/database/prisma-spell-unit-of-work";
import { PrismaInvoiceRepository } from "@/infrastructure/repositories/prisma-invoice-repository";
import { PrismaPaymentTransactionRepository } from "@/infrastructure/repositories/prisma-payment-transaction-repository";
import { PrismaSpellActivationRepository } from "@/infrastructure/repositories/prisma-spell-activation-repository";
import { PrismaSpellLicenseEventRepository } from "@/infrastructure/repositories/prisma-spell-event-repository";
import { PrismaSpellAttemptRepository, PrismaSpellNonceRepository } from "@/infrastructure/repositories/prisma-spell-guard-repository";
import { PrismaSpellInstallationRepository } from "@/infrastructure/repositories/prisma-spell-installation-repository";
import { PrismaSpellLicenseRepository } from "@/infrastructure/repositories/prisma-spell-license-repository";
import { PrismaSubscriptionRepository } from "@/infrastructure/repositories/prisma-subscription-repository";
import { KeyRingSpellCodeVault } from "@/infrastructure/spell/code-vault";
import { JoseSpellTokenIssuer } from "@/infrastructure/spell/entitlement-token";
import { parseSpellConfig } from "@/infrastructure/spell/spell-config";
import { makeSpellEnv } from "../unit/helpers/spell-kit";

/**
 * Real Postgres: payment verification + licence issuance are idempotent per
 * payment (UNIQUE spell_licenses.purchase_invoice_id), ownership is strict.
 * QPay itself is faked (no credentials); everything else is the real stack.
 */
const config = parseSpellConfig(makeSpellEnv());
const deps: SpellAdminDeps = {
  unitOfWork: new PrismaSpellUnitOfWork({ maxAttempts: 8, baseDelayMs: 5 }),
  repos: {
    licenseRepository: new PrismaSpellLicenseRepository(prisma),
    installationRepository: new PrismaSpellInstallationRepository(prisma),
    activationRepository: new PrismaSpellActivationRepository(prisma),
    eventRepository: new PrismaSpellLicenseEventRepository(prisma),
  },
  attemptRepository: new PrismaSpellAttemptRepository(prisma),
  nonceRepository: new PrismaSpellNonceRepository(prisma),
  vault: new KeyRingSpellCodeVault(config.codeHmacKeys, config.codeEncryptionKeys),
  tokenIssuer: new JoseSpellTokenIssuer(config.signing),
  policy: { ...DEFAULT_SPELL_POLICY },
  userRepository: { findById: async (id: string) => (await prisma.user.findUnique({ where: { id } })) as never },
  auditLogRepository: { create: async () => ({}) as never },
  randomBytes: (n) => randomBytes(n),
};

class FakeQpay implements QpayGateway {
  next: QpayCheckedPayment = { count: 0, paidAmountMnt: 0, rows: [] };
  async createInvoice(i: QpayCreateInvoiceInput): Promise<QpayCreatedInvoice> {
    return { providerInvoiceId: `qp-${i.senderInvoiceNo}`, qrText: "qr", qrImage: "cXI=", shortUrl: null, urls: [] };
  }
  async checkPayment() {
    return this.next;
  }
}

const invoices = new PrismaInvoiceRepository(prisma);
const payments = new PrismaPaymentTransactionRepository(prisma);
const subs = new PrismaSubscriptionRepository(prisma);
const qpay = new FakeQpay();
const billing = {
  invoiceRepository: invoices,
  paymentTransactionRepository: payments,
  subscriptionRepository: subs,
  billingUnitOfWork: new PrismaBillingUnitOfWork(),
  qpayGateway: qpay,
  qpayCallbackUrl: "https://tore.test/cb",
  spellFulfillment: (inv: Parameters<typeof fulfillSpellPurchase>[0]) => fulfillSpellPurchase(inv, deps),
};
const ENV = { SPELL_PRICES_MNT: JSON.stringify({ SPELL_1M: 9900, SPELL_3M: 24900 }) };

async function user() {
  const id = `spellbuy_${randomUUID()}`;
  await prisma.user.create({ data: { id, email: `${id}@spell-test.local`, role: "CLIENT", status: "ACTIVE" } });
  return { userId: id, role: UserRole.CLIENT };
}

afterAll(async () => {
  await prisma.$disconnect();
});
beforeAll(async () => {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.columns WHERE table_name='spell_licenses' AND column_name='purchase_invoice_id'`;
  if (Number(rows[0]?.n) !== 1) throw new Error("Run `prisma migrate deploy` (spell_purchase_fields) against SPELL_TEST_DATABASE_URL first.");
});

describe("TORE Spell purchase on real Postgres", () => {
  it("pay → verify → exactly one licence, even under 12 racing callbacks/polls and a later replay", async () => {
    const buyer = await user();
    const view = await createSpellCheckout(buyer, "SPELL_3M", { invoiceRepository: invoices, qpayGateway: qpay, qpayCallbackUrl: "x", env: ENV });
    expect(view.amountMnt).toBe(24900);

    qpay.next = { count: 1, paidAmountMnt: 24900, rows: [{ paymentId: `pay-${randomUUID()}`, status: "PAID", amountMnt: 24900, currency: "MNT" }] };
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        i % 2 === 0 ? processQpayInvoicePayment(`qp-${view.invoiceId}`, billing) : getOwnSpellPurchaseStatus(buyer, view.invoiceId, billing, deps),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThan(0);
    await processQpayInvoicePayment(`qp-${view.invoiceId}`, billing); // replay after settlement

    const rows = await prisma.spellLicense.findMany({ where: { purchaseInvoiceId: view.invoiceId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "PURCHASE", ownerUserId: buyer.userId, planCode: "SPELL_3M", durationMonths: 3, product: "TORE_SPELL" });
    expect(await prisma.paymentTransaction.count({ where: { invoiceId: view.invoiceId } })).toBe(1);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: view.invoiceId } })).status).toBe(InvoiceStatus.PAID);

    const again = await fulfillSpellPurchase((await invoices.findById(view.invoiceId))!, deps);
    expect(again).toMatchObject({ created: false, licenseId: rows[0]!.id });
  });

  it("unpaid / wrong-amount payment issues nothing; another user cannot read or reveal the licence", async () => {
    const buyer = await user();
    const stranger = await user();
    const view = await createSpellCheckout(buyer, "SPELL_1M", { invoiceRepository: invoices, qpayGateway: qpay, qpayCallbackUrl: "x", env: ENV });
    qpay.next = { count: 0, paidAmountMnt: 0, rows: [] };
    await expect(processQpayInvoicePayment(`qp-${view.invoiceId}`, billing)).rejects.toMatchObject({ code: "PAYMENT_NOT_SUCCESSFUL" });
    expect(await prisma.spellLicense.count({ where: { purchaseInvoiceId: view.invoiceId } })).toBe(0);

    qpay.next = { count: 1, paidAmountMnt: 9900, rows: [{ paymentId: `pay-${randomUUID()}`, status: "PAID", amountMnt: 9900, currency: "MNT" }] };
    await processQpayInvoicePayment(`qp-${view.invoiceId}`, billing);
    const mine = await listOwnerLicenses(buyer, deps);
    expect(mine).toHaveLength(1);
    expect(await listOwnerLicenses(stranger, deps)).toHaveLength(0);
    await expect(getOwnSpellPurchaseStatus(stranger, view.invoiceId, billing, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(revealLicenseCode(stranger, mine[0]!.id, null, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await revealLicenseCode(buyer, mine[0]!.id, null, deps)).code.length).toBeGreaterThan(10);

    // wrong amount on a second invoice: FAILED, no licence
    const second = await createSpellCheckout(buyer, "SPELL_3M", { invoiceRepository: invoices, qpayGateway: qpay, qpayCallbackUrl: "x", env: ENV });
    qpay.next = { count: 1, paidAmountMnt: 100, rows: [{ paymentId: `pay-${randomUUID()}`, status: "PAID", amountMnt: 100, currency: "MNT" }] };
    await expect(processQpayInvoicePayment(`qp-${second.invoiceId}`, billing)).rejects.toMatchObject({ code: "WRONG_AMOUNT" });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: second.invoiceId } })).status).toBe("FAILED");
    expect(await prisma.spellLicense.count({ where: { purchaseInvoiceId: second.invoiceId } })).toBe(0);
  });
});
