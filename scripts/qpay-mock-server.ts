/**
 * LOCAL TEST DOUBLE for the QPay Merchant V2 API — NOT QPay, never used in
 * production. Lets the real TORE QPay client run end to end on a laptop:
 *   QPAY_BASE_URL=http://127.0.0.1:4010 QPAY_CLIENT_ID=x QPAY_CLIENT_SECRET=y \
 *   QPAY_INVOICE_CODE=z QPAY_CALLBACK_URL=http://localhost:3100/api/billing/qpay/callback
 * `POST /__pay/<invoice_id>` simulates the customer paying the invoice
 * amount (`?amount=` overrides, for wrong-amount tests).
 */
import http from "node:http";

type Inv = { amount: number; paid: number };
const invoices = new Map<string, Inv>();

export function startQpayMock(port = 4010): Promise<http.Server> {
  const srv = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const send = (j: unknown, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(j));
    };
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/v2/auth/token") return send({ access_token: "mock-token", expires_in: 3600, token_type: "Bearer" });
    if (url.pathname === "/v2/invoice") {
      const b = JSON.parse(raw) as { amount: number; sender_invoice_no: string };
      const id = `mock-${b.sender_invoice_no}`;
      invoices.set(id, { amount: b.amount, paid: 0 });
      return send({ invoice_id: id, qr_text: `MOCKQR:${id}`, qr_image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", qPay_shortUrl: "https://example.invalid/qpay", urls: [] });
    }
    if (url.pathname === "/v2/payment/check") {
      const b = JSON.parse(raw) as { object_id: string };
      const inv = invoices.get(b.object_id);
      if (!inv || inv.paid === 0) return send({ count: 0, paid_amount: 0, rows: [] });
      return send({ count: 1, paid_amount: inv.paid, rows: [{ payment_id: `pay-${b.object_id}`, payment_status: "PAID", payment_amount: inv.paid, payment_currency: "MNT" }] });
    }
    const m = /^\/__pay\/(.+)$/.exec(url.pathname);
    if (m) {
      const inv = invoices.get(decodeURIComponent(m[1]!));
      if (!inv) return send({ error: "unknown invoice" }, 404);
      inv.paid = Number(url.searchParams.get("amount") ?? inv.amount);
      return send({ ok: true, paid: inv.paid });
    }
    return send({ error: "not found" }, 404);
  });
  return new Promise((resolve) => srv.listen(port, "127.0.0.1", () => resolve(srv)));
}

if (require.main === module) {
  void startQpayMock(Number(process.env.PORT ?? 4010)).then(() => console.log("QPay MOCK listening (test double, not QPay)"));
}
