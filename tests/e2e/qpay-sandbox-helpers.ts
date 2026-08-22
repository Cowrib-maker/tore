import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

import { prisma } from "@/infrastructure/database/prisma";
import { createQpayGateway } from "@/infrastructure/billing/create-qpay-gateway";
import { addUtcCalendarMonth } from "@/domain/services/subscription-period";

export const REQUIRED_QPAY_ENV = [
  "QPAY_BASE_URL",
  "QPAY_CLIENT_ID",
  "QPAY_CLIENT_SECRET",
  "QPAY_CALLBACK_URL",
  "QPAY_INVOICE_CODE",
] as const;

export type CheckoutView = {
  invoiceId: string;
  planCode: string;
  amountMnt: number;
  currency: string;
  status: string;
  expiresAt: string;
  qrText: string | null;
  qrImage: string | null;
  shortUrl: string | null;
  deeplinks: Array<{ name: string; description: string; logo: string; link: string }>;
};

export class CookieJar {
  private readonly cookies = new Map<string, string>();

  absorb(headers: Headers): void {
    const lines =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : headerSetCookieFallback(headers);
    for (const line of lines) {
      const pair = line.split(";")[0];
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

function headerSetCookieFallback(headers: Headers): string[] {
  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;=]+=[^;]+)/);
}

export function readSandboxE2eConfig(): {
  baseUrl: string;
  paymentWaitMs: number;
  pollMs: number;
} {
  const missing = REQUIRED_QPAY_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `QPay Sandbox E2E missing env: ${missing.join(", ")}. Set them in .env (never commit secrets).`,
    );
  }

  const baseUrl = (
    process.env.TORE_E2E_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");

  const qpayHost = new URL(process.env.QPAY_BASE_URL!).hostname;
  if (qpayHost === "merchant.qpay.mn") {
    throw new Error(
      "Refusing production QPay host merchant.qpay.mn. Set QPAY_BASE_URL=https://merchant-sandbox.qpay.mn",
    );
  }

  return {
    baseUrl,
    paymentWaitMs: Number(process.env.QPAY_E2E_PAYMENT_WAIT_MS ?? 5 * 60 * 1000),
    pollMs: Number(process.env.QPAY_E2E_POLL_MS ?? 5000),
  };
}

export function assertNoQpaySecretsInPayload(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  const secretKeys = [
    process.env.QPAY_CLIENT_ID,
    process.env.QPAY_CLIENT_SECRET,
  ].filter((value): value is string => typeof value === "string" && value.length >= 8);
  for (const secret of secretKeys) {
    if (serialized.includes(secret)) {
      throw new Error("QPay credential leaked into a client-facing payload");
    }
  }
  if (/QPAY_CLIENT_SECRET|access_token|Basic [A-Za-z0-9+/=]{12,}/i.test(serialized)) {
    throw new Error("QPay credential-shaped data leaked into a client-facing payload");
  }
}

export async function ensureE2eLawyer(): Promise<{
  id: string;
  email: string;
  password: string;
}> {
  const password =
    process.env.QPAY_E2E_LAWYER_PASSWORD?.trim() ||
    `QpayE2e-${randomBytes(6).toString("hex")}1`;
  const email = (
    process.env.QPAY_E2E_LAWYER_EMAIL?.trim() ||
    `qpay-e2e+${Date.now()}@tore.test`
  ).toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findFirst({
    where: { email, deletedAt: null },
  });
  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: "LAWYER",
        status: "ACTIVE",
        passwordHash,
        emailVerified: existing.emailVerified ?? new Date(),
      },
    });
    return { id: updated.id, email, password };
  }

  const created = await prisma.user.create({
    data: {
      email,
      name: "QPay Sandbox E2E Lawyer",
      role: "LAWYER",
      status: "ACTIVE",
      passwordHash,
      emailVerified: new Date(),
      preferredLanguage: "mn",
    },
  });
  return { id: created.id, email, password };
}

export async function loginLawyer(
  baseUrl: string,
  email: string,
  password: string,
): Promise<CookieJar> {
  const jar = new CookieJar();
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, {
    headers: { cookie: jar.header() },
  });
  jar.absorb(csrfRes.headers);
  if (!csrfRes.ok) {
    throw new Error(
      `Auth CSRF failed (${csrfRes.status}). Is Next.js running at ${baseUrl}? Start with npm run dev.`,
    );
  }
  const csrfJson = (await csrfRes.json()) as { csrfToken?: string };
  if (!csrfJson.csrfToken) {
    throw new Error("Auth CSRF response did not include csrfToken");
  }

  const body = new URLSearchParams({
    csrfToken: csrfJson.csrfToken,
    email,
    password,
    callbackUrl: `${baseUrl}/lawyer/dashboard`,
    json: "true",
    redirect: "false",
  });
  const loginRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: jar.header(),
    },
    body,
    redirect: "manual",
  });
  jar.absorb(loginRes.headers);
  if (loginRes.status >= 400) {
    const text = await loginRes.text();
    throw new Error(
      `Lawyer login failed (${loginRes.status}). ${text.slice(0, 300)}`,
    );
  }
  const cookieHeader = jar.header();
  if (!/session-token/i.test(cookieHeader)) {
    throw new Error(
      "Login did not set a session cookie. Check AUTH_SECRET / AUTH_URL match the running Next.js process.",
    );
  }
  return jar;
}

export async function fetchJson(
  baseUrl: string,
  jar: CookieJar | null,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(jar ? { cookie: jar.header() } : {}),
    },
    redirect: "manual",
  });
  jar?.absorb(response.headers);
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  return { status: response.status, json };
}

export function printSandboxPayInstructions(
  checkout: CheckoutView,
  providerInvoiceId: string,
): void {
  console.log("\n========== QPay Sandbox — pay this invoice ==========");
  console.log(`TORE invoice id:     ${checkout.invoiceId}`);
  console.log(`QPay provider id:    ${providerInvoiceId}`);
  console.log(`Amount:              ${checkout.amountMnt} ${checkout.currency}`);
  console.log(`Short URL:           ${checkout.shortUrl ?? "(none)"}`);
  console.log(`QR text:             ${checkout.qrText ?? "(none)"}`);
  if (checkout.deeplinks.length > 0) {
    console.log("Deeplinks:");
    for (const link of checkout.deeplinks) {
      console.log(`  - ${link.name}: ${link.link}`);
    }
  }
  console.log("Pay this invoice in QPay Sandbox (bank app / QR / short URL).");
  console.log("This test polls QPay POST /v2/payment/check until PAID (or timeout).");
  console.log("Activation happens only after Sandbox confirms payment.");
  console.log("=====================================================\n");
}

export async function waitForSandboxPayment(
  providerInvoiceId: string,
  waitMs: number,
  pollMs: number,
): Promise<{ paid: boolean; check: unknown }> {
  const gateway = createQpayGateway();
  const deadline = Date.now() + waitMs;
  let last: unknown = null;
  while (Date.now() < deadline) {
    const checked = await gateway.checkPayment(providerInvoiceId);
    last = checked;
    const paid = checked.rows.some(
      (row) => row.status === "PAID" && Boolean(row.paymentId),
    );
    if (paid) {
      return { paid: true, check: checked };
    }
    console.log(
      `[qpay-sandbox-e2e] waiting for payment… count=${checked.count} paid_amount=${checked.paidAmountMnt}`,
    );
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { paid: false, check: last };
}

export function expectedSoloExpiry(startsAt: Date): Date {
  return addUtcCalendarMonth(startsAt);
}

export { prisma };
