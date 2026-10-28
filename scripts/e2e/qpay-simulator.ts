/**
 * QPay SANDBOX SIMULATOR — NOT QPay. A tiny HTTP server that speaks just enough of the QPay v2 API (token, invoice, payment/check) for the
 * application's REAL QpayHttpGateway, REAL callback route and REAL database to be exercised end to end. It proves our code's behaviour against the
 * documented API shape; it proves NOTHING about the real QPay service, merchant account, credentials or callbacks. Any report must keep
 * «REAL HTTP + REAL DB» and «REAL QPay» apart: this file is why the first can be VERIFIED while the second is REQUIRES PRODUCTION CONFIGURATION.
 *
 * Control endpoints (test only): POST /__sim/pay { providerInvoiceId, amount?, status?, currency? } marks an invoice paid (or any status).
 */
import http from "node:http";

export type SimInvoice = { id: string; amount: number; senderInvoiceNo: string; payments: { payment_id: string; payment_status: string; payment_amount: number; payment_currency: string }[] };

export type QpaySimulator = { baseUrl: string; invoices: Map<string, SimInvoice>; calls: { path: string }[]; close(): Promise<void> };

export async function startQpaySimulator(opts: { port: number; clientId: string; clientSecret: string; invoiceCode: string; idPrefix?: string }): Promise<QpaySimulator> {
  const invoices = new Map<string, SimInvoice>();
  const calls: { path: string }[] = [];
  let seq = 0;
  const read = (req: http.IncomingMessage) => new Promise<string>((res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => res(b)); });
  const send = (res: http.ServerResponse, status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

  const server = http.createServer(async (req, res) => {
    const path = req.url ?? "";
    calls.push({ path });
    const raw = await read(req);
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (path === "/v2/auth/token") {
      const expected = `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64")}`;
      if (req.headers.authorization !== expected) return send(res, 401, { error: "bad credentials" });
      return send(res, 200, { access_token: "sim-token", expires_in: 3600 });
    }
    if (path.startsWith("/v2/") && req.headers.authorization !== "Bearer sim-token") return send(res, 401, { error: "no token" });
    if (path === "/v2/invoice") {
      if (body.invoice_code !== opts.invoiceCode) return send(res, 400, { error: "INVOICE_CODE_INVALID" });
      const id = `${opts.idPrefix ?? "SIM"}-${(seq += 1)}`;
      invoices.set(id, { id, amount: Number(body.amount), senderInvoiceNo: String(body.sender_invoice_no), payments: [] });
      return send(res, 200, { invoice_id: id, qr_text: `SIM-QR-${id}`, qr_image: "", qPay_shortUrl: null, urls: [] });
    }
    if (path === "/v2/payment/check") {
      const inv = invoices.get(String(body.object_id));
      const rows = inv?.payments ?? [];
      const paid = rows.filter((r) => r.payment_status === "PAID").reduce((s, r) => s + r.payment_amount, 0);
      return send(res, 200, { count: rows.length, paid_amount: paid, rows });
    }
    if (path === "/__sim/pay") {
      const inv = invoices.get(String(body.providerInvoiceId));
      if (!inv) return send(res, 404, { error: "unknown invoice" });
      inv.payments.push({ payment_id: `PAY-${inv.id}-${inv.payments.length + 1}`, payment_status: String(body.status ?? "PAID"), payment_amount: Number(body.amount ?? inv.amount), payment_currency: String(body.currency ?? "MNT") });
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "not found" });
  });
  await new Promise<void>((r) => server.listen(opts.port, "127.0.0.1", r));
  return { baseUrl: `http://127.0.0.1:${opts.port}`, invoices, calls, close: () => new Promise((r) => server.close(() => r())) };
}
