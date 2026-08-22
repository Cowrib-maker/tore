import type {
  QpayCheckedPayment,
  QpayCreateInvoiceInput,
  QpayCreatedInvoice,
  QpayGateway,
} from "@/domain/ports/qpay-gateway";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";
import type { QpayConfig } from "@/infrastructure/billing/qpay-config";
import type {
  QpayV2CreateInvoiceRequest,
  QpayV2CreateInvoiceResponse,
  QpayV2PaymentCheckRequest,
  QpayV2PaymentCheckResponse,
  QpayV2TokenResponse,
} from "@/infrastructure/billing/qpay-v2-types";

const TOKEN_SKEW_MS = 15_000;

function roundMnt(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

export class QpayHttpGateway implements QpayGateway {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly config: QpayConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async createInvoice(input: QpayCreateInvoiceInput): Promise<QpayCreatedInvoice> {
    const token = await this.authenticate();
    const body: QpayV2CreateInvoiceRequest = {
      invoice_code: this.config.invoiceCode,
      sender_invoice_no: input.senderInvoiceNo,
      invoice_receiver_code: "terminal",
      invoice_description: input.description,
      amount: input.amountMnt,
      callback_url: input.callbackUrl,
    };
    const response = await this.requestJson<QpayV2CreateInvoiceResponse>(
      "POST",
      "/v2/invoice",
      token,
      body,
    );
    if (!response.invoice_id) {
      throw new PaymentVerificationError(
        "QPay did not return an invoice",
        "QPAY_UNAVAILABLE",
        503,
      );
    }
    return {
      providerInvoiceId: response.invoice_id,
      qrText: response.qr_text ?? "",
      qrImage: response.qr_image ?? "",
      shortUrl: response.qPay_shortUrl ?? null,
      urls: (response.urls ?? []).map((url) => ({
        name: url.name,
        description: url.description,
        logo: url.logo,
        link: url.link,
      })),
    };
  }

  async checkPayment(providerInvoiceId: string): Promise<QpayCheckedPayment> {
    const token = await this.authenticate();
    const body: QpayV2PaymentCheckRequest = {
      object_type: "INVOICE",
      object_id: providerInvoiceId,
    };
    const response = await this.requestJson<QpayV2PaymentCheckResponse>(
      "POST",
      "/v2/payment/check",
      token,
      body,
    );
    const rows = response.rows ?? [];
    return {
      count: response.count ?? rows.length,
      paidAmountMnt: roundMnt(response.paid_amount ?? 0),
      rows: rows.map((row) => ({
        paymentId: row.payment_id,
        status: row.payment_status,
        amountMnt: roundMnt(row.payment_amount),
        currency: row.payment_currency ?? "",
      })),
    };
  }

  private async authenticate(): Promise<string> {
    if (
      this.accessToken &&
      Date.now() < this.accessTokenExpiresAt - TOKEN_SKEW_MS
    ) {
      return this.accessToken;
    }

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");
    const response = await this.fetchImpl(
      `${this.config.baseUrl}/v2/auth/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      },
    );
    if (!response.ok) {
      throw new PaymentVerificationError(
        "QPay authentication failed",
        "QPAY_UNAVAILABLE",
        503,
      );
    }
    const payload = (await response.json()) as QpayV2TokenResponse;
    if (!payload.access_token || !payload.expires_in) {
      throw new PaymentVerificationError(
        "QPay authentication failed",
        "QPAY_UNAVAILABLE",
        503,
      );
    }
    this.accessToken = payload.access_token;
    this.accessTokenExpiresAt = Date.now() + payload.expires_in * 1000;
    return this.accessToken;
  }

  private async requestJson<T>(
    method: string,
    path: string,
    token: string,
    body: unknown,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new PaymentVerificationError(
        "QPay request failed",
        "QPAY_UNAVAILABLE",
        503,
      );
    }
    return (await response.json()) as T;
  }
}
