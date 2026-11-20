import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import { processQpayInvoicePayment } from "@/application/use-cases/billing/process-qpay-payment";
import { revealLicenseCode, listOwnerLicenses } from "@/application/use-cases/spell/owner-licenses";
import { createSpellCheckout, fulfillSpellPurchase } from "@/application/use-cases/spell/purchase";
import { getOwnSpellPurchaseStatus } from "@/application/use-cases/spell/purchase-status";
import { InvoiceStatus } from "@/domain/enums";
import type { QpayCheckedPayment, QpayCreateInvoiceInput, QpayCreatedInvoice, QpayGateway } from "@/domain/ports/qpay-gateway";
import { SpellLicenseSource } from "@/domain/spell/enums";
import { getSpellInstallerUrl } from "@/domain/spell/installer";
import { getSpellPriceList, getSpellPriceMnt, parseSpellPrices } from "@/domain/spell/pricing";
import { InMemoryBillingUnitOfWork } from "@/infrastructure/database/in-memory-billing-unit-of-work";
import { InMemoryInvoiceRepository, InMemoryPaymentTransactionRepository } from "@/infrastructure/repositories/in-memory-invoice-repository";
import { InMemorySubscriptionRepository } from "@/infrastructure/repositories/in-memory-subscription-repository";
import { DAY, makeSpell, newDevice, rejection } from "./helpers/spell-kit";

const PRICES = JSON.stringify({ SPELL_1M: 9900, SPELL_3M: 24900, SPELL_6M: 44900, SPELL_12M: 79900 });
const ENV = { SPELL_PRICES_MNT: PRICES };

class FakeQpay implements QpayGateway {
  created: QpayCreateInvoiceInput[] = [];
  next: QpayCheckedPayment = { count: 0, paidAmountMnt: 0, rows: [] };
  async createInvoice(input: QpayCreateInvoiceInput): Promise<QpayCreatedInvoice> {
    this.created.push(input);
    return { providerInvoiceId: `qp-${input.senderInvoiceNo}`, qrText: "qr", qrImage: "cXI=", shortUrl: "https://qpay.mn/s/x", urls: [] };
  }
  async checkPayment(): Promise<QpayCheckedPayment> {
    return this.next;
  }
  pay(amount: number, id = "pay-1") {
    this.next = { count: 1, paidAmountMnt: amount, rows: [{ paymentId: id, status: "PAID", amountMnt: amount, currency: "MNT" }] };
  }
}

function world() {
  const s = makeSpell();
  const qpay = new FakeQpay();
  const invoices = new InMemoryInvoiceRepository();
  const payments = new InMemoryPaymentTransactionRepository();
  const subs = new InMemorySubscriptionRepository();
  let fulfilFails = false;
  const billing = {
    invoiceRepository: invoices,
    paymentTransactionRepository: payments,
    subscriptionRepository: subs,
    billingUnitOfWork: new InMemoryBillingUnitOfWork({ invoiceRepository: invoices, paymentTransactionRepository: payments, subscriptionRepository: subs }),
    qpayGateway: qpay,
    qpayCallbackUrl: "https://tore.test/api/billing/qpay/callback",
    spellFulfillment: async (inv: Parameters<typeof fulfillSpellPurchase>[0]) => {
      if (fulfilFails) throw new Error("spell unavailable");
      return fulfillSpellPurchase(inv, s.deps);
    },
  };
  const buyer: ActorContext = s.addUser("buyer-1");
  const other: ActorContext = s.addUser("other-1");
  return { s, qpay, invoices, billing, buyer, other, setFulfilFails: (v: boolean) => (fulfilFails = v), licenses: () => [...s.mem.state.licenses.values()] };
}

async function start(w: ReturnType<typeof world>, plan = "SPELL_3M") {
  return createSpellCheckout(w.buyer, plan, { invoiceRepository: w.invoices, qpayGateway: w.qpay, qpayCallbackUrl: w.billing.qpayCallbackUrl, env: ENV });
}

describe("pricing (single server-side source)", () => {
  it("has no built-in prices: with no configuration every plan is 'not for sale'", () => {
    expect(getSpellPriceList({}).every((p) => p.priceMnt === null)).toBe(true);
    expect(getSpellPriceMnt("SPELL_1M" as never, {})).toBeNull();
  });
  it("reads prices only from SPELL_PRICES_MNT and ignores junk (non-integers, zero, negatives, unknown plans, bad JSON)", () => {
    expect(parseSpellPrices(PRICES)).toEqual({ SPELL_1M: 9900, SPELL_3M: 24900, SPELL_6M: 44900, SPELL_12M: 79900 });
    expect(parseSpellPrices('{"SPELL_1M":0,"SPELL_3M":-5,"SPELL_6M":1.5,"SPELL_12M":"9","SPELL_99M":100}')).toEqual({});
    expect(parseSpellPrices("not json")).toEqual({});
    expect(getSpellPriceList(ENV).map((p) => p.durationMonths)).toEqual([1, 3, 6, 12]);
  });
  it("installer URL comes from configuration only and must be https", () => {
    expect(getSpellInstallerUrl({})).toBeNull();
    expect(getSpellInstallerUrl({ SPELL_WINDOWS_INSTALLER_URL: "http://x/a.exe" })).toBeNull();
    expect(getSpellInstallerUrl({ SPELL_WINDOWS_INSTALLER_URL: "javascript:alert(1)" })).toBeNull();
    expect(getSpellInstallerUrl({ SPELL_WINDOWS_INSTALLER_URL: "https://downloads.example/TORE-Spell-Setup.exe" })).toContain("https://downloads.example/");
  });
});

describe("checkout: the server decides product, duration and price", () => {
  it("creates a QPay invoice at the configured price; the request carries only a plan code", async () => {
    const w = world();
    const view = await start(w, "SPELL_6M");
    expect(view).toMatchObject({ planCode: "SPELL_6M", durationMonths: 6, amountMnt: 44900, status: InvoiceStatus.PENDING });
    expect(w.qpay.created[0]).toMatchObject({ amountMnt: 44900 });
    const stored = await w.invoices.findById(view.invoiceId);
    expect(stored).toMatchObject({ userId: "buyer-1", spellPlanCode: "SPELL_6M", amountMnt: 44900 });
    expect(w.licenses()).toHaveLength(0); // nothing granted by merely starting
  });
  it("refuses unknown plans, object-shaped input and plans without a configured price", async () => {
    const w = world();
    const deps = { invoiceRepository: w.invoices, qpayGateway: w.qpay, qpayCallbackUrl: "x", env: ENV };
    await expect(createSpellCheckout(w.buyer, "SPELL_99M", deps)).rejects.toThrow();
    await expect(createSpellCheckout(w.buyer, { planCode: "SPELL_1M", amountMnt: 1 }, deps)).rejects.toThrow();
    await expect(createSpellCheckout(w.buyer, "SPELL_1M", { ...deps, env: {} })).rejects.toThrow(/үнэ/);
    expect(w.qpay.created).toHaveLength(0);
  });
  it("re-uses the same pending invoice for the same plan (no duplicate invoices on double-click)", async () => {
    const w = world();
    const a = await start(w);
    const b = await start(w);
    expect(b.invoiceId).toBe(a.invoiceId);
    expect(w.qpay.created).toHaveLength(1);
  });
});

describe("payment verification → licence (never before, never twice)", () => {
  it("verified payment issues exactly one PURCHASE licence owned by the buyer", async () => {
    const w = world();
    const view = await start(w);
    expect(w.licenses()).toHaveLength(0);
    w.qpay.pay(24900);
    const res = await processQpayInvoicePayment(`qp-${view.invoiceId}`, w.billing);
    expect(res.invoice.status).toBe(InvoiceStatus.PAID);
    const [lic] = w.licenses();
    expect(w.licenses()).toHaveLength(1);
    expect(lic).toMatchObject({ source: SpellLicenseSource.PURCHASE, ownerUserId: "buyer-1", planCode: "SPELL_3M", durationMonths: 3, purchaseInvoiceId: view.invoiceId, product: "TORE_SPELL" });
    expect(lic!.startsAt).toBeNull(); // the term clock starts at first activation (existing design)
  });

  it("unpaid, or paid with the wrong amount: no licence", async () => {
    const w = world();
    const a = await start(w, "SPELL_1M");
    await expect(processQpayInvoicePayment(`qp-${a.invoiceId}`, w.billing)).rejects.toMatchObject({ code: "PAYMENT_NOT_SUCCESSFUL" });
    expect(w.licenses()).toHaveLength(0);
    w.qpay.pay(1); // paid something, but not the invoice amount
    await expect(processQpayInvoicePayment(`qp-${a.invoiceId}`, w.billing)).rejects.toMatchObject({ code: "WRONG_AMOUNT" });
    expect((await w.invoices.findById(a.invoiceId))!.status).toBe(InvoiceStatus.FAILED);
    expect(w.licenses()).toHaveLength(0);
  });

  it("repeated and concurrent callbacks never create a second licence", async () => {
    const w = world();
    const view = await start(w);
    w.qpay.pay(24900);
    await Promise.all(Array.from({ length: 6 }, () => processQpayInvoicePayment(`qp-${view.invoiceId}`, w.billing)));
    await processQpayInvoicePayment(`qp-${view.invoiceId}`, w.billing);
    expect(w.licenses()).toHaveLength(1);
    const again = await fulfillSpellPurchase((await w.invoices.findById(view.invoiceId))!, w.s.deps);
    expect(again.created).toBe(false);
    expect(w.licenses()).toHaveLength(1);
  });

  it("a fulfilment that fails after payment is deferred and healed by the next status check", async () => {
    const w = world();
    const view = await start(w);
    w.qpay.pay(24900);
    w.setFulfilFails(true);
    const res = await processQpayInvoicePayment(`qp-${view.invoiceId}`, w.billing);
    expect(res.invoice.status).toBe(InvoiceStatus.PAID); // payment recorded, callback still succeeds
    expect(w.licenses()).toHaveLength(0);
    w.setFulfilFails(false);
    const status = await getOwnSpellPurchaseStatus(w.buyer, view.invoiceId, w.billing, w.s.deps);
    expect(status.paid).toBe(true);
    expect(status.licenseId).toBe(w.licenses()[0]!.id);
    expect(w.licenses()).toHaveLength(1);
  });

  it("fulfilment refuses an invoice that is not PAID", async () => {
    const w = world();
    const view = await start(w);
    await expect(fulfillSpellPurchase((await w.invoices.findById(view.invoiceId))!, w.s.deps)).rejects.toThrow();
    expect(w.licenses()).toHaveLength(0);
  });
});

describe("account access", () => {
  it("only the buyer sees the purchase status or the licence; another user gets NotFound / nothing", async () => {
    const w = world();
    const view = await start(w);
    w.qpay.pay(24900);
    await processQpayInvoicePayment(`qp-${view.invoiceId}`, w.billing);
    await expect(getOwnSpellPurchaseStatus(w.other, view.invoiceId, w.billing, w.s.deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const mine = await listOwnerLicenses(w.buyer, w.s.deps);
    expect(mine).toHaveLength(1);
    expect(JSON.stringify(mine)).not.toMatch(/codeHash|codeCiphertext/);
    expect(await listOwnerLicenses(w.other, w.s.deps)).toHaveLength(0);
    await expect(revealLicenseCode(w.other, mine[0]!.id, null, w.s.deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { code } = await revealLicenseCode(w.buyer, mine[0]!.id, null, w.s.deps);
    expect(code).toMatch(/^[A-Z0-9-]{10,}$/);
  });
});

describe("the purchased licence works on the desktop path, then expires", () => {
  it("activates with the revealed code, then is refused after the term (no auto-renew)", async () => {
    const w = world();
    const view = await start(w, "SPELL_1M");
    w.qpay.pay(9900);
    await processQpayInvoicePayment(`qp-${view.invoiceId}`, w.billing);
    const [lic] = await listOwnerLicenses(w.buyer, w.s.deps);
    const { code } = await revealLicenseCode(w.buyer, lic!.id, null, w.s.deps);
    const device = newDevice();
    const grant = await w.s.activate(device, code, { now: w.s.t0 });
    expect(grant.status).toBe("ACTIVATED");
    const later = new Date(w.s.t0.getTime() + 40 * DAY);
    const r = await rejection(w.s.validate(device, grant.activationId, later));
    expect(r.code).toBe("LICENSE_EXPIRED");
  });
});
