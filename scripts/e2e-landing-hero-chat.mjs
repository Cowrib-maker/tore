/**
 * Production-style E2E verification for landing hero chat.
 * Run: node scripts/e2e-landing-hero-chat.mjs
 * Requires: dev server on localhost:3000, OPENAI_API_KEY configured.
 */
import { chromium, devices } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const STATIC_CLARIFICATION_PREFIX =
  "Таны хэлсэн нөхцөл байдал хууль зүйн асуудал байж болзошгүй";
const ERROR_MESSAGE =
  "Таны асуултыг ойлголоо. Түр хүлээгээд дахин оролдоно уу.";
const NON_LEGAL_REFUSAL =
  "Би TORE Chat — хууль зүйн асуудлаар энгийнээр туслах зориулалттай";

const results = [];

function record(id, name, pass, details) {
  results.push({ id, name, pass, details });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`\n[${mark}] ${id}. ${name}`);
  if (details) {
    console.log(details);
  }
}

function countQuestions(text) {
  return (text.match(/\?/g) ?? []).length;
}

function isLongLegalLecture(text) {
  const markers = [
    "1. Товч хариулт",
    "2. Таны нөхцөл байдал",
    "3. Хуульд юу гэж заасан",
    "4. Одоо юу хийх",
    "5. Ямар баримт",
    "6. Анхаарах зүйл",
    "7. Эх сурвалж",
  ];
  const hits = markers.filter((m) => text.includes(m)).length;
  return hits >= 4 || text.length > 1400;
}

function requiresLegalJargon(text) {
  return /ямар хуулийн салбар|хуулийн нэр томьёо|иргэний үү|эрүүгийн үү/i.test(
    text,
  );
}

async function openHeroChat(page) {
  await page.goto(`${BASE}/#chat`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Асуудлаа өөрийнхөөрөө бичээрэй.").waitFor({
    state: "visible",
    timeout: 30_000,
  });
}

function assistantBubbles(page) {
  return page.locator(
    'div.flex.justify-start div.rounded-2xl.rounded-tl-md',
  );
}

function userBubbles(page) {
  return page.locator(
    'div.flex.justify-end div.rounded-2xl.rounded-br-md',
  );
}

async function sendHeroMessage(page, text, timeoutMs = 90_000) {
  const textarea = page.getByPlaceholder("Асуудлаа өөрийнхөөрөө бичээрэй.");
  const before = await assistantBubbles(page).count();
  await textarea.fill(text);
  await textarea
    .locator('xpath=ancestor::form[1]')
    .getByRole("button", { name: "Илгээх" })
    .click();
  await page.waitForFunction(
    (prev) =>
      document.querySelectorAll(
        'div.flex.justify-start div.rounded-2xl.rounded-tl-md',
      ).length > prev,
    before,
    { timeout: timeoutMs },
  );
  await page.getByText("TORE Chat бичиж байна...").waitFor({
    state: "hidden",
    timeout: timeoutMs,
  }).catch(() => {});
  const bubbles = assistantBubbles(page);
  return (await bubbles.last().innerText()).trim();
}

async function runScenarioSuite(page, context, chatRequests) {
  await openHeroChat(page);

  // 1. Natural citizen language
  const r1 = await sendHeroMessage(
    page,
    "Манай ажил олгогч намайг гэнэт ажлаас халчихлаа.",
  );
  const q1 = countQuestions(r1);
  const s1Pass =
    !r1.includes(NON_LEGAL_REFUSAL) &&
    !requiresLegalJargon(r1) &&
    !isLongLegalLecture(r1) &&
    q1 >= 1 &&
    q1 <= 3;
  record(
    "1",
    "Natural citizen language",
    s1Pass,
    `Assistant (${r1.length} chars, ${q1} ?): ${r1.slice(0, 280)}${r1.length > 280 ? "…" : ""}`,
  );

  // 2. Context continuation
  const r2 = await sendHeroMessage(page, "Ямар ч тайлбар өгөөгүй.");
  const s2Pass =
    r2 !== r1 &&
    !r2.includes(STATIC_CLARIFICATION_PREFIX) &&
    !r2.includes(NON_LEGAL_REFUSAL) &&
    /ажил|хал|ажил олгогч|тайлбар/i.test(r2);
  record(
    "2",
    "Context continuation",
    s2Pass,
    `Assistant: ${r2.slice(0, 280)}${r2.length > 280 ? "…" : ""}`,
  );

  // 3. Short informal follow-up
  const r3 = await sendHeroMessage(page, "харин тэр асуудал чинь байна");
  const s3Pass =
    r3 !== r2 &&
    r3 !== r1 &&
    !r3.includes(STATIC_CLARIFICATION_PREFIX) &&
    !r3.includes(NON_LEGAL_REFUSAL);
  record(
    "3",
    "Very short informal follow-up",
    s3Pass,
    `Assistant: ${r3.slice(0, 280)}${r3.length > 280 ? "…" : ""}`,
  );

  // 4. Legal terminology not required (new guest session)
  await context.clearCookies();
  await page.reload({ waitUntil: "networkidle" });
  await openHeroChat(page);
  let r4 = "";
  try {
    r4 = await sendHeroMessage(
      page,
      "Байр авсан чинь дараа нь асуудал гарчихлаа.",
      120_000,
    );
  } catch (error) {
    record(
      "4",
      "Legal terminology is NOT required",
      false,
      `Timeout or error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  const s4Pass =
    !r4.includes(NON_LEGAL_REFUSAL) &&
    !requiresLegalJargon(r4) &&
    (/байр|орон сууц|гэр|асуудал/i.test(r4) || countQuestions(r4) >= 1);
  record(
    "4",
    "Legal terminology is NOT required",
    s4Pass,
    `Assistant: ${r4.slice(0, 280)}${r4.length > 280 ? "…" : ""}`,
  );

  // 5. Repetition protection (same session as 4)
  const followUps = ["тийм ээ яг тэр", "одоо яах вэ", "цаашид"];
  const assistantTexts = [r4];
  let s5Pass = true;
  const s5Details = [];
  for (const msg of followUps) {
    const reply = await sendHeroMessage(page, msg);
    const prev = assistantTexts.at(-1);
    if (reply === prev) {
      s5Pass = false;
      s5Details.push(`Repeated after "${msg}": ${reply.slice(0, 120)}`);
    } else if (
      reply ===
      "Ойлголоо. Та нөхцөл байдлаа өөр үгээр бага зэрэг тодруулж өгч болох уу?"
    ) {
      s5Details.push(`Safe fallback after "${msg}" (acceptable)`);
    }
    assistantTexts.push(reply);
  }
  record(
    "5",
    "Repetition protection",
    s5Pass,
    s5Details.length ? s5Details.join("\n") : `Turns: ${assistantTexts.length}`,
  );

  // 7. Conversation state (track API payloads, fresh guest)
  await context.clearCookies();
  await page.reload({ waitUntil: "networkidle" });
  await openHeroChat(page);
  chatRequests.length = 0;
  const ids = [];
  const replies = [];
  const msgs = [
    "Манай ажил олгогч намайг гэнэт ажлаас халчихлаа.",
    "Ямар ч тайлбар өгөөгүй.",
    "харин тэр асуудал чинь байна",
    "тийм ээ яг тэр",
    "одоо яах вэ",
  ];
  for (const msg of msgs) {
    replies.push(await sendHeroMessage(page, msg));
  }
  const conversationIds = [
    ...new Set(chatRequests.map((r) => r.conversationId).filter(Boolean)),
  ];
  const s7Pass =
    conversationIds.length === 1 &&
    chatRequests.length === msgs.length &&
    chatRequests.every((r, i) => r.message === msgs[i]) &&
    replies.every((text, i) => i === 0 || text !== replies[i - 1]);
  record(
    "7",
    "Conversation state",
    s7Pass,
    `conversationIds=${JSON.stringify(conversationIds)}; requests=${chatRequests.length}; uniqueReplies=${new Set(replies).size}/${replies.length}`,
  );

  // 8. Refresh behavior
  const userCountBefore = await userBubbles(page).count();
  const assistantCountBefore = await assistantBubbles(page).count();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByPlaceholder("Асуудлаа өөрийнхөөрөө бичээрэй.").waitFor({
    state: "visible",
  });
  const userCountAfter = await userBubbles(page).count();
  const assistantCountAfter = await assistantBubbles(page).count();
  const s8Pass = userCountAfter === 0 && assistantCountAfter === 0;
  record(
    "8",
    "Refresh behavior (no persistence expected)",
    s8Pass,
    `Before refresh: ${userCountBefore} user / ${assistantCountBefore} assistant; after: ${userCountAfter} user / ${assistantCountAfter} assistant`,
  );

  return { r1, r2, r3 };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const chatRequests = [];

  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/api/ai/chat")
    ) {
      try {
        const body = JSON.parse(request.postData() ?? "{}");
        chatRequests.push({
          conversationId: body.conversationId ?? null,
          message: body.message ?? "",
        });
      } catch {
        // ignore
      }
    }
  });

  try {
    await runScenarioSuite(page, context, chatRequests);

    // 6. API error simulation (fresh guest)
    await context.clearCookies();
    await page.reload({ waitUntil: "networkidle" });
    await openHeroChat(page);
    let lastAssistantBeforeError = "";
    await context.route("**/api/ai/chat", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "simulated failure", code: "AI_UNAVAILABLE" }),
      }),
    );
    const textarea = page.getByPlaceholder("Асуудлаа өөрийнхөөрөө бичээрэй.");
    await textarea.fill("Тест алдааны мессеж");
    await textarea
      .locator('xpath=ancestor::form[1]')
      .getByRole("button", { name: "Илгээх" })
      .click();
    await page.getByRole("alert").filter({ hasText: ERROR_MESSAGE }).waitFor({
      timeout: 15_000,
    });
    const alertText = (
      await page.getByRole("alert").filter({ hasText: ERROR_MESSAGE }).innerText()
    ).trim();
    const assistantAfterError = await assistantBubbles(page).count();
    const s6Pass =
      alertText === ERROR_MESSAGE &&
      assistantAfterError === 0 &&
      !alertText.includes(NON_LEGAL_REFUSAL);
    record(
      "6",
      "API error handling",
      s6Pass,
      `Alert: "${alertText}"; assistant bubbles after error: ${assistantAfterError}`,
    );
    await context.unroute("**/api/ai/chat");

    // 9. Mobile viewport
    const mobile = await browser.newContext({
      ...devices["iPhone 13"],
    });
    const mobilePage = await mobile.newPage();
    await openHeroChat(mobilePage);
    await mobilePage.getByPlaceholder("Асуудлаа өөрийнхөөрөө бичээрэй.").fill(
      "Гар утасны тест",
    );
    const mobileTextarea = mobilePage.getByPlaceholder(
      "Асуудлаа өөрийнхөөрөө бичээрэй.",
    );
    await mobileTextarea
      .locator('xpath=ancestor::form[1]')
      .getByRole("button", { name: "Илгээх" })
      .click();
    await mobilePage
      .locator('div.flex.justify-end div.rounded-2xl.rounded-br-md')
      .first()
      .waitFor({ timeout: 10_000 });
    const overflowX = await mobilePage.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 2;
    });
    const textareaBox = await mobilePage
      .getByPlaceholder("Асуудлаа өөрийнхөөрөө бичээрэй.")
      .boundingBox();
    const sendVisible = await mobileTextarea
      .locator('xpath=ancestor::form[1]')
      .getByRole("button", { name: "Илгээх" })
      .isVisible();
    const transcript = mobilePage.locator(
      'div.max-h-80.overflow-y-auto',
    );
    const transcriptVisible = await transcript.isVisible().catch(() => false);
    const s9Pass =
      !overflowX && textareaBox?.width > 0 && sendVisible && transcriptVisible;
    record(
      "9",
      "Mobile viewport",
      s9Pass,
      `overflowX=${overflowX}; textarea width=${textareaBox?.width}; send=${sendVisible}; transcript=${transcriptVisible}`,
    );
    await mobile.close();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log("\n========== SUMMARY ==========");
  for (const r of results.sort((a, b) => Number(a.id) - Number(b.id))) {
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id}. ${r.name}`);
  }
  console.log(`\nTotal: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
