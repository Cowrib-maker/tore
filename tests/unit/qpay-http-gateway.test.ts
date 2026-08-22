import { describe, expect, it, vi } from "vitest";

import { QpayHttpGateway } from "@/infrastructure/billing/qpay-http-gateway";

describe("QpayHttpGateway Merchant V2 contract", () => {
  it("authenticates, creates an invoice, and checks payment using documented fields only", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v2/auth/token")) {
        expect(init?.headers).toMatchObject({
          Authorization: `Basic ${Buffer.from("sandbox-id:sandbox-secret").toString("base64")}`,
        });
        return new Response(
          JSON.stringify({
            token_type: "Bearer",
            access_token: "tok_test",
            expires_in: 600,
            refresh_token: "ref_test",
            refresh_expires_in: 3600,
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/v2/invoice")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toEqual({
          invoice_code: "TORE_INVOICE",
          sender_invoice_no: "inv-1",
          invoice_receiver_code: "terminal",
          invoice_description: "TORE SOLO — 1 month",
          amount: 49000,
          callback_url: "https://tore.test/api/billing/qpay/callback",
        });
        return new Response(
          JSON.stringify({
            invoice_id: "qpay-1",
            qr_text: "qr",
            qr_image: "img",
            qPay_shortUrl: "https://qpay.mn/s/1",
            urls: [
              {
                name: "Khan bank",
                description: "app",
                logo: "https://example.com/l.png",
                link: "khanbank://pay",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/v2/payment/check")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toEqual({ object_type: "INVOICE", object_id: "qpay-1" });
        return new Response(
          JSON.stringify({
            count: 1,
            paid_amount: 49000,
            rows: [
              {
                payment_id: "pay-1",
                payment_status: "PAID",
                payment_amount: "49000.00",
                payment_currency: "MNT",
              },
            ],
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const gateway = new QpayHttpGateway(
      {
        baseUrl: "https://merchant-sandbox.qpay.mn",
        clientId: "sandbox-id",
        clientSecret: "sandbox-secret",
        callbackUrl: "https://tore.test/api/billing/qpay/callback",
        invoiceCode: "TORE_INVOICE",
      },
      fetchImpl as unknown as typeof fetch,
    );

    const created = await gateway.createInvoice({
      senderInvoiceNo: "inv-1",
      amountMnt: 49_000,
      description: "TORE SOLO — 1 month",
      callbackUrl: "https://tore.test/api/billing/qpay/callback",
    });
    expect(created.providerInvoiceId).toBe("qpay-1");
    const checked = await gateway.checkPayment("qpay-1");
    expect(checked.paidAmountMnt).toBe(49_000);
    expect(checked.rows[0]?.paymentId).toBe("pay-1");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "merchant-sandbox.qpay.mn",
    );
  });
});
