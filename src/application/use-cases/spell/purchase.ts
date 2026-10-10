import { randomUUID } from "node:crypto";

import type { ActorContext } from "@/application/common/actor-context";
import { BILLING_PROVIDER_QPAY, InvoiceStatus } from "@/domain/enums";
import { NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";
import type { Invoice, InvoiceDeeplink } from "@/domain/entities/invoice";
import type { QpayGateway } from "@/domain/ports/qpay-gateway";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import { SOLO_INVOICE_CURRENCY } from "@/domain/services/qpay-payment-verification";
import { SpellActorType, SpellEventType, SpellLicenseSource, type SpellPlanCode } from "@/domain/spell/enums";
import { formatLicenseCode, generateCanonicalLicenseCode, licenseCodeHint } from "@/domain/spell/license-code";
import { getSpellPlan, isSpellPlanCode } from "@/domain/spell/plans";
import { getSpellPriceMnt } from "@/domain/spell/pricing";
import { addDays } from "@/domain/spell/license-state";
import type { SpellAdminDeps } from "./deps";

/** Invoice lifetime for a Spell purchase. */
export const SPELL_INVOICE_TTL_MS = 60 * 60 * 1000;

export type SpellCheckoutView = {
  invoiceId: string;
  planCode: SpellPlanCode;
  durationMonths: number;
  amountMnt: number;
  currency: string;
  status: InvoiceStatus;
  expiresAt: string;
  qrText: string | null;
  qrImage: string | null;
  shortUrl: string | null;
  deeplinks: InvoiceDeeplink[];
};

export function toSpellCheckoutView(invoice: Invoice): SpellCheckoutView {
  const code = invoice.spellPlanCode as SpellPlanCode;
  return {
    invoiceId: invoice.id,
    planCode: code,
    durationMonths: getSpellPlan(code).durationMonths,
    amountMnt: invoice.amountMnt,
    currency: invoice.currency,
    status: invoice.status,
    expiresAt: invoice.expiresAt.toISOString(),
    qrText: invoice.qrText,
    qrImage: invoice.qrImage,
    shortUrl: invoice.shortUrl,
    deeplinks: invoice.deeplinks,
  };
}

export type CreateSpellCheckoutDeps = {
  invoiceRepository: InvoiceRepository;
  qpayGateway: QpayGateway;
  qpayCallbackUrl: string;
  /** Test seam; production reads process.env. */
  env?: Record<string, string | undefined>;
};

/**
 * Starts a TORE Spell purchase. Plan and price are resolved HERE, from the
 * plan catalog and server configuration; the request carries only a plan
 * code. Nothing is granted until payment is verified (see fulfil below).
 */
export async function createSpellCheckout(
  actor: ActorContext,
  planCode: unknown,
  deps: CreateSpellCheckoutDeps,
  now: Date = new Date(),
): Promise<SpellCheckoutView> {
  if (!isSpellPlanCode(planCode)) throw new ValidationError("Unknown Spell plan");
  const priceMnt = getSpellPriceMnt(planCode, deps.env ?? process.env);
  if (priceMnt === null) {
    throw new ValidationError("Энэ лицензийн үнэ одоогоор тохируулагдаагүй байна.");
  }
  const plan = getSpellPlan(planCode);

  const existing = await deps.invoiceRepository.findLatestPendingForUser(actor.userId, now);
  if (
    existing &&
    existing.spellPlanCode === planCode &&
    existing.amountMnt === priceMnt &&
    existing.providerInvoiceId &&
    existing.qrText
  ) {
    return toSpellCheckoutView(existing);
  }

  const invoice = await deps.invoiceRepository.create({
    userId: actor.userId,
    spellPlanCode: planCode,
    amountMnt: priceMnt,
    currency: SOLO_INVOICE_CURRENCY,
    provider: BILLING_PROVIDER_QPAY,
    status: InvoiceStatus.PENDING,
    expiresAt: new Date(now.getTime() + SPELL_INVOICE_TTL_MS),
  });

  try {
    const created = await deps.qpayGateway.createInvoice({
      senderInvoiceNo: invoice.id,
      amountMnt: priceMnt,
      description: `TORE Spell - ${plan.durationMonths} month licence`,
      callbackUrl: deps.qpayCallbackUrl,
    });
    const attached = await deps.invoiceRepository.attachProviderInvoice(invoice.id, {
      providerInvoiceId: created.providerInvoiceId,
      qrText: created.qrText,
      qrImage: created.qrImage,
      shortUrl: created.shortUrl,
      deeplinks: created.urls,
    });
    return toSpellCheckoutView(attached);
  } catch (error) {
    await deps.invoiceRepository.updateStatus(invoice.id, InvoiceStatus.FAILED).catch(() => undefined);
    if (error instanceof PaymentVerificationError) throw error;
    throw new PaymentVerificationError("QPay request failed", "QPAY_UNAVAILABLE", 503);
  }
}

/**
 * Idempotent fulfilment: mints the licence for a PAID Spell invoice exactly
 * once. Safe to call from the QPay callback, from status polling and from the
 * account page (self-healing if an earlier attempt crashed): the licence row
 * carries a UNIQUE purchaseInvoiceId, so concurrent/repeated calls converge
 * on the same licence. The plaintext code is never returned or logged here;
 * the owner reads it through the existing audited reveal.
 */
export async function fulfillSpellPurchase(
  invoice: Invoice,
  deps: SpellAdminDeps,
  now: Date = new Date(),
): Promise<{ licenseId: string; created: boolean }> {
  if (invoice.status !== InvoiceStatus.PAID || !invoice.spellPlanCode) {
    throw new NotFoundError("Invoice");
  }
  const planCode = invoice.spellPlanCode;
  const plan = getSpellPlan(planCode);

  const existing = await deps.repos.licenseRepository.findByPurchaseInvoiceId(invoice.id);
  if (existing) return { licenseId: existing.id, created: false };

  const owner = await deps.userRepository.findById(invoice.userId);
  if (!owner || owner.deletedAt) throw new NotFoundError("User");

  const canonical = generateCanonicalLicenseCode(deps.randomBytes);
  const id = randomUUID();
  const { hash, keyId } = deps.vault.hashForStorage(canonical);
  const { ciphertext, keyVersion } = deps.vault.encrypt(canonical, id);

  try {
    await deps.unitOfWork.runInTransaction(async (repos) => {
      // Re-check inside the SERIALIZABLE transaction; the unique index is the hard backstop.
      if (await repos.licenseRepository.findByPurchaseInvoiceId(invoice.id)) return;
      const created = await repos.licenseRepository.create({
        id,
        product: plan.product,
        planCode: plan.code,
        durationMonths: plan.durationMonths,
        source: SpellLicenseSource.PURCHASE,
        ownerUserId: invoice.userId,
        codeHash: hash,
        codeHashKeyId: keyId,
        codeCiphertext: ciphertext,
        codeEncKeyVersion: keyVersion,
        codeHint: licenseCodeHint(canonical),
        redeemBy: addDays(now, deps.policy.redeemByDays),
        issuedByUserId: null,
        purchaseInvoiceId: invoice.id,
      });
      await repos.eventRepository.append({
        licenseId: created.id,
        type: SpellEventType.LICENSE_ISSUED,
        actorType: SpellActorType.SYSTEM,
        actorUserId: null,
        metadata: {
          planCode: plan.code,
          durationMonths: plan.durationMonths,
          source: SpellLicenseSource.PURCHASE,
          ownerUserId: invoice.userId,
          invoiceId: invoice.id,
          redeemBy: created.redeemBy.toISOString(),
        },
        createdAt: now,
      });
    });
  } catch (error) {
    // A concurrent fulfilment may have won; converge on its licence.
    const winner = await deps.repos.licenseRepository.findByPurchaseInvoiceId(invoice.id);
    if (winner) return { licenseId: winner.id, created: false };
    throw error;
  }
  const minted = await deps.repos.licenseRepository.findByPurchaseInvoiceId(invoice.id);
  if (!minted) throw new Error("Spell licence was not persisted");
  return { licenseId: minted.id, created: minted.id === id };
}

/** Re-exported so callers format the owner-visible code consistently. */
export { formatLicenseCode };
