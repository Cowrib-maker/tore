import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";

import { LEGAL_AI_AUTHENTICATION_REQUIRED_MESSAGE } from "@/domain/constants/subscription-plans";
import { InvoiceStatus, LegalQuestionStatus, SubscriptionStatus } from "@/domain/enums";
import { prisma } from "@/infrastructure/database/prisma";
import {
  CookieJar,
  REQUIRED_QPAY_ENV,
  SANDBOX_PLAN_EXPECTATIONS,
  assertNoQpaySecretsInPayload,
  ensureE2eCitizen,
  fetchJson,
  loginUser,
  readSandboxE2eConfig,
  waitForSandboxPayment,
  type CheckoutView,
} from "./qpay-sandbox-helpers";

/**
 * Landing hero → guest quota → clarification → ANSWERED → auth/billing gates.
 * Run: npm run test:landing-access-e2e
 * Requires: npm run dev, DATABASE_URL, OPENAI_API_KEY, AUTH_SECRET
 */
const baseUrl = (
  process.env.TORE_E2E_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

const GUEST_FIRST =
  "Манай ажил олгогч намайг гэнэт ажлаас халчихлаа.";
const GUEST_CLARIFY =
  "Ямар ч тайлбар өгөөгүй, зөвхөн амаар хэлсэн.";
const GUEST_SUBSTANTIVE =
  "Тийм, бичгээр тушаал өгсөн, шалтгаан нь компанийн санхүүгийн асуудал гэж хэлсэн.";
const GUEST_NEW_QUESTION =
  "Надаас мөнгө зээлээд буцааж өгөхгүй байна.";

function isQpayConfigured(): boolean {
  return REQUIRED_QPAY_ENV.every((key) => Boolean(process.env[key]?.trim()));
}

async function postChat(
  jar: CookieJar,
  message: string,
  conversationId?: string,
  extraCookieHeader?: string,
) {
  const cookie = [jar.header(), extraCookieHeader].filter(Boolean).join("; ");
  const response = await fetch(`${baseUrl}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie,
    },
    body: JSON.stringify({ message, conversationId }),
    redirect: "manual",
  });
  jar.absorb(response.headers);
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

async function getEntitlement(jar: CookieJar) {
  return fetchJson(baseUrl, jar, "/api/ai/entitlement");
}

async function assertServerUp(): Promise<void> {
  const health = await fetch(`${baseUrl}/api/health`);
  if (!health.ok) {
    throw new Error(
      `Dev server not reachable at ${baseUrl}. Start with npm run dev.`,
    );
  }
}

describe("Landing hero access flow E2E", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    await assertServerUp();
  });

  it("1–5,10,12: guest free thread, clarification, ANSWERED, auth gate, thread identity", async () => {
    const guestJar = new CookieJar();

    const entitlementBefore = await getEntitlement(guestJar);
    expect(entitlementBefore.status).toBe(200);
    const beforeBody = entitlementBefore.json as {
      remainingLegalQuestions?: number;
      audience?: string;
    };
    expect(beforeBody.remainingLegalQuestions).toBe(1);

    const first = await postChat(guestJar, GUEST_FIRST);
    expect(first.status).toBe(200);
    const firstBody = first.json as {
      conversationId?: string;
      message?: { content?: string };
    };
    expect(firstBody.conversationId).toBeTruthy();
    expect(firstBody.message?.content?.length).toBeGreaterThan(10);
    const conversationId = firstBody.conversationId!;

    const entitlementAfterFirst = await getEntitlement(guestJar);
    const afterFirstBody = entitlementAfterFirst.json as {
      remainingLegalQuestions?: number;
      audience?: string;
      exhaustedNextStep?: string;
    };
    expect(afterFirstBody.audience).toBe("guest");
    expect(afterFirstBody.remainingLegalQuestions).toBe(0);

    const convAfterFirst = await prisma.aIConversation.findUnique({
      where: { id: conversationId },
    });
    expect(convAfterFirst?.billedQuestionCount).toBe(1);
    expect(convAfterFirst?.questionStatus).toBe(LegalQuestionStatus.CLARIFYING);

    const clarify = await postChat(guestJar, GUEST_CLARIFY, conversationId);
    expect(clarify.status).toBe(200);
    expect((clarify.json as { conversationId?: string }).conversationId).toBe(
      conversationId,
    );

    const convAfterClarify = await prisma.aIConversation.findUnique({
      where: { id: conversationId },
    });
    expect(convAfterClarify?.billedQuestionCount).toBe(1);

    const answered = await postChat(
      guestJar,
      GUEST_SUBSTANTIVE,
      conversationId,
    );
    expect(answered.status).toBe(200);
    const convAnswered = await prisma.aIConversation.findUnique({
      where: { id: conversationId },
    });
    expect(convAnswered?.questionStatus).toBe(LegalQuestionStatus.ANSWERED);

    const blocked = await postChat(guestJar, GUEST_NEW_QUESTION, conversationId);
    expect(blocked.status).toBe(401);
    const blockedBody = blocked.json as { code?: string; error?: string };
    expect(blockedBody.code).toBe("AUTHENTICATION_REQUIRED");
    expect(blockedBody.error).toContain(
      LEGAL_AI_AUTHENTICATION_REQUIRED_MESSAGE.slice(0, 20),
    );

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const cookies = guestJar.header().split("; ").map((pair) => {
      const eq = pair.indexOf("=");
      return {
        name: pair.slice(0, eq),
        value: pair.slice(eq + 1),
        url: baseUrl,
      };
    });
    await context.addCookies(cookies.filter((c) => c.name && c.value));
    await page.goto(`${baseUrl}/#chat`, { waitUntil: "networkidle" });
    const textarea = page.getByPlaceholder("Асуудлаа өөрийнхөөрөө бичээрэй.");
    await textarea.fill(GUEST_NEW_QUESTION);
    await textarea
      .locator("xpath=ancestor::form[1]")
      .getByRole("button", { name: "Илгээх" })
      .click();
    await page.getByRole("dialog").waitFor({ timeout: 15_000 });
    const chatGate = page.locator("#chat").getByRole("dialog");
    await chatGate.getByRole("link", { name: "Нэвтрэх" }).waitFor({ state: "visible" });
    await chatGate.getByRole("link", { name: "Бүртгүүлэх" }).waitFor({ state: "visible" });
    const assistantCount = await page
      .locator("div.flex.justify-start div.rounded-2xl.rounded-tl-md")
      .count();
    expect(assistantCount).toBe(0);
    await browser.close();

    const citizen = await ensureE2eCitizen("basic");
    const authJar = await loginUser(baseUrl, citizen.email, citizen.password);
    const claimedChat = await postChat(
      authJar,
      "Энэ яриаг үргэлжлүүлж байна.",
      conversationId,
      guestJar.header(),
    );
    expect(claimedChat.status).toBe(200);
    const claimedConv = await prisma.aIConversation.findUnique({
      where: { id: conversationId },
    });
    expect(claimedConv?.userId).toBe(citizen.id);
  }, 180_000);

  it("6–7,9: unpaid citizen billing gate, checkout, unpaid callback does not unlock", async () => {
    const citizen = await ensureE2eCitizen("basic");
    const jar = await loginUser(baseUrl, citizen.email, citizen.password);

    const first = await postChat(jar, GUEST_FIRST);
    expect(first.status).toBe(200);
    const conversationId = (first.json as { conversationId?: string })
      .conversationId!;

    await postChat(jar, GUEST_CLARIFY, conversationId);
    await postChat(jar, GUEST_SUBSTANTIVE, conversationId);

    const entitlement = await getEntitlement(jar);
    const entBody = entitlement.json as {
      audience?: string;
      remainingLegalQuestions?: number;
      exhaustedNextStep?: string;
    };
    expect(entBody.audience).toBe("unpaid_citizen");
    expect(entBody.remainingLegalQuestions).toBe(0);
    expect(entBody.exhaustedNextStep).toBe("billing");

    const blocked = await postChat(jar, GUEST_NEW_QUESTION, conversationId);
    expect(blocked.status).toBe(402);
    expect((blocked.json as { code?: string }).code).toBe("BILLING_REQUIRED");

    if (!isQpayConfigured()) {
      console.warn(
        "[landing-access-e2e] QPay env missing — step 7 checkout NOT RUN",
      );
      return;
    }

    const checkoutRes = await fetchJson(
      baseUrl,
      jar,
      "/api/citizen/billing/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: SANDBOX_PLAN_EXPECTATIONS.CITIZEN_BASIC.planCode,
        }),
      },
    );
    expect(checkoutRes.status).toBe(200);
    const checkout = checkoutRes.json as CheckoutView;
    expect(checkout.amountMnt).toBe(19_900);
    expect(checkout.planCode).toBe("CITIZEN_BASIC");
    assertNoQpaySecretsInPayload(checkout);
    expect(
      Boolean(checkout.qrImage) ||
        Boolean(checkout.shortUrl) ||
        checkout.deeplinks.length > 0,
    ).toBe(true);

    const localInvoice = await prisma.invoice.findUnique({
      where: { id: checkout.invoiceId },
    });
    expect(localInvoice?.status).toBe(InvoiceStatus.PENDING);
    const providerInvoiceId = localInvoice!.providerInvoiceId!;

    const unpaidCallback = await fetchJson(
      baseUrl,
      null,
      "/api/billing/qpay/callback",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: providerInvoiceId }),
      },
    );
    expect(unpaidCallback.status).toBe(200);
    expect((unpaidCallback.json as { ok?: boolean }).ok).toBe(false);

    const stillBlocked = await postChat(jar, GUEST_NEW_QUESTION, conversationId);
    expect(stillBlocked.status).toBe(402);

    expect(
      await prisma.subscription.findFirst({
        where: {
          ownerUserId: citizen.id,
          status: SubscriptionStatus.ACTIVE,
          planCode: "CITIZEN_BASIC",
        },
      }),
    ).toBeNull();
  }, 180_000);

  it("8: successful QPay sandbox payment unlocks legal AI (manual sandbox pay)", async () => {
    if (!isQpayConfigured()) {
      console.warn(
        "[landing-access-e2e] Step 8 NOT RUN — QPay sandbox env vars missing",
      );
      return;
    }

    if (process.env.QPAY_E2E_SKIP_PAYMENT === "true") {
      console.warn(
        "[landing-access-e2e] Step 8 NOT RUN — QPAY_E2E_SKIP_PAYMENT=true",
      );
      return;
    }

    const config = readSandboxE2eConfig();
    const citizen = await ensureE2eCitizen("basic");
    const jar = await loginUser(baseUrl, citizen.email, citizen.password);

    const checkoutRes = await fetchJson(
      baseUrl,
      jar,
      "/api/citizen/billing/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: "CITIZEN_BASIC" }),
      },
    );
    expect(checkoutRes.status).toBe(200);
    const checkout = checkoutRes.json as CheckoutView;
    const localInvoice = await prisma.invoice.findUnique({
      where: { id: checkout.invoiceId },
    });
    const providerInvoiceId = localInvoice!.providerInvoiceId!;
    console.log(
      `[landing-access-e2e] Pay invoice ${providerInvoiceId} in QPay Sandbox, then polling…`,
    );

    const sandbox = await waitForSandboxPayment(
      providerInvoiceId,
      90_000,
      config.pollMs,
    );
    if (!sandbox.paid) {
      console.warn(
        "[landing-access-e2e] Step 8 NOT RUN — QPay Sandbox payment not confirmed within 90s (manual pay required)",
      );
      return;
    }

    const callback = await fetchJson(
      baseUrl,
      null,
      "/api/billing/qpay/callback",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: providerInvoiceId }),
      },
    );
    expect(callback.status).toBe(200);
    expect((callback.json as { ok?: boolean }).ok).toBe(true);

    const unlocked = await postChat(jar, "Төлбөр төлсний дараах тест асуулт");
    expect(unlocked.status).toBe(200);
    expect((unlocked.json as { message?: { content?: string } }).message?.content)
      .toBeTruthy();

    const paidEntitlement = await getEntitlement(jar);
    const paidBody = paidEntitlement.json as {
      audience?: string;
      remainingLegalQuestions?: number;
    };
    expect(paidBody.audience).toBe("paid_citizen");
    expect(paidBody.remainingLegalQuestions).toBeGreaterThan(0);
  }, 180_000);
});
