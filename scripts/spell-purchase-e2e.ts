/**
 * Browser E2E of the TORE Spell commercial journey against a LOCAL dev
 * server + local Postgres + the local QPay test double (qpay-mock-server.ts).
 * The server must be started with TORE_SPELL_V1=1, the Spell key/vault env,
 * SPELL_PRICES_MNT, SPELL_WINDOWS_INSTALLER_URL, QPAY_* → the mock, and
 * EMAIL_PROVIDER=console (log → $DEV_LOG).
 *   DEV_LOG=/tmp/dev.log BASE=http://localhost:3100 npx tsx scripts/spell-purchase-e2e.ts
 * Real QPay payment is not exercised (no credentials); the mock only plays
 * the customer's bank. Never prints the licence code.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { chromium, type Browser } from "playwright";

import { prisma } from "../src/infrastructure/database/prisma";
import { startQpayMock } from "./qpay-mock-server";

const BASE = process.env.BASE ?? "http://localhost:3100";
const LOG = process.env.DEV_LOG ?? "/tmp/dev.log";
const tag = Date.now().toString(36);
const results: { step: string; ok: boolean; detail?: string }[] = [];
const rec = (step: string, ok: boolean, detail?: string) => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? "  — " + detail : ""}`);
};

function otpFromLog(email: string): string | null {
  const blocks = fs.readFileSync(LOG, "utf8").split("[email:console] Outbound email").filter((b) => b.includes(`to=${email}`));
  return /\b(\d{6})\b/.exec(blocks.at(-1) ?? "")?.[1] ?? null;
}

async function registerAndLogin(browser: Browser, email: string) {
  const ctx = await browser.newContext({ locale: "mn-MN" });
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/register/client`);
  await pg.fill("#name", "Spell Buyer");
  await pg.fill("#email", email);
  await pg.fill("#password", "E2e-Passw0rd!x");
  await pg.fill("#confirmPassword", "E2e-Passw0rd!x");
  for (const c of await pg.$$('input[type="checkbox"]')) await c.check();
  await pg.click('button[type="submit"]');
  await pg.waitForTimeout(3500);
  const otp = otpFromLog(email);
  if (!otp) throw new Error("no OTP");
  const boxes = await pg.$$('input[inputmode="numeric"]');
  if (boxes.length >= 6) for (let i = 0; i < 6; i += 1) await boxes[i]!.fill(otp[i]!);
  else if (boxes.length === 1) await boxes[0]!.fill(otp);
  await pg.waitForTimeout(500);
  await (await pg.$('button[type="submit"]'))?.click();
  await pg.waitForTimeout(3000);
  if (/login|verify/.test(pg.url())) {
    await pg.context().clearCookies();
    await pg.goto(`${BASE}/login`);
    await pg.fill('input[name="email"]', email);
    await pg.fill('input[name="password"]', "E2e-Passw0rd!x");
    await pg.click('button[type="submit"]');
    await pg.waitForTimeout(3500);
  }
  return { ctx, pg };
}

async function main() {
  const mock = await startQpayMock(4010);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  let invoiceId = "";
  try {
    // A. anonymous
    const anon = await (await browser.newContext({ locale: "mn-MN" })).newPage();
    await anon.goto(`${BASE}/spell`, { waitUntil: "networkidle" });
    const priced = await anon.$$eval("#pricing li", (els) => els.map((e) => e.textContent ?? ""));
    rec("anonymous /spell shows four licence options with prices", priced.length === 4 && priced.every((t) => /₮/.test(t)), priced.map((t) => t.replace(/\s+/g, " ").slice(0, 30)).join(" | "));
    rec("anonymous is asked to sign in before buying", (await anon.$$eval("#pricing li a", (els) => els.map((e) => e.textContent))).every((t) => /Нэвтэрч/.test(t ?? "")));
    await anon.goto(`${BASE}/spell/license`);
    rec("anonymous /spell/license → login", /\/login/.test(anon.url()), anon.url());
    const anonApi = await anon.request.post(`${BASE}/api/spell/purchase`, { data: { planCode: "SPELL_1M" } });
    rec("anonymous cannot create a purchase (401)", anonApi.status() === 401, String(anonApi.status()));

    // B. authenticated purchase
    const email = `spellbuyer-${tag}@e2e.test`;
    const { ctx, pg } = await registerAndLogin(browser, email);
    await pg.goto(`${BASE}/spell`, { waitUntil: "networkidle" });
    await pg.waitForTimeout(1500); // hydration
    const buy = pg.locator("#pricing li", { hasText: "3 сар" }).locator("button");
    rec("logged-in user sees a Buy button per plan", (await pg.locator("#pricing li button").count()) === 4);
    await buy.click();
    await pg.waitForSelector('img[alt="QPay QR"]', { timeout: 15000 });
    const shown = await pg.textContent("#pricing");
    rec("QPay checkout shows the SERVER price (24 900 ₮) and a QR", /24[\s  ,.]?900/.test(shown ?? ""));
    const inv = await prisma.invoice.findFirstOrThrow({ where: { user: { email }, spellPlanCode: "SPELL_3M" } });
    invoiceId = inv.id;
    rec("invoice stored with server-side plan/price, PENDING, no licence yet", inv.amountMnt === 24900 && inv.status === "PENDING" && (await prisma.spellLicense.count({ where: { purchaseInvoiceId: inv.id } })) === 0);

    // tampering: a browser-supplied amount is ignored / plan object rejected
    const tamper = await pg.request.post(`${BASE}/api/spell/purchase`, { data: { planCode: "SPELL_1M", amountMnt: 1 } });
    const tj = (await tamper.json()) as { amountMnt?: number };
    rec("browser-supplied amount is ignored (charged = configured 1-month price)", tamper.ok() && tj.amountMnt === 9900, String(tj.amountMnt));

    // customer pays at the (mock) bank → status poll verifies server-side
    await fetch(`http://127.0.0.1:4010/__pay/${encodeURIComponent(inv.providerInvoiceId!)}`, { method: "POST" });
    await pg.waitForSelector("text=Төлбөр баталгаажлаа", { timeout: 20000 });
    rec("payment verified server-side → page shows 'Төлбөр баталгаажлаа'", true);
    const lic = await prisma.spellLicense.findMany({ where: { purchaseInvoiceId: inv.id } });
    rec("exactly one licence issued: PURCHASE, TORE_SPELL, 3 months, owned by the buyer", lic.length === 1 && lic[0]!.source === "PURCHASE" && lic[0]!.durationMonths === 3 && lic[0]!.product === "TORE_SPELL");

    // F. duplicate callbacks
    for (let i = 0; i < 3; i += 1) await fetch(`${BASE}/api/billing/qpay/callback`, { method: "POST", body: JSON.stringify({ invoice_id: inv.providerInvoiceId }) });
    rec("duplicate QPay callbacks create no second licence / payment", (await prisma.spellLicense.count({ where: { purchaseInvoiceId: inv.id } })) === 1 && (await prisma.paymentTransaction.count({ where: { invoiceId: inv.id } })) === 1);

    // C. account
    await pg.click(`a[href="/spell/license"]`);
    await pg.waitForURL("**/spell/license");
    const accountText = (await pg.textContent("main")) ?? "";
    rec("account shows the licence, status Идэвхтэй and period", /Идэвхтэй/.test(accountText) && /3 сар/.test(accountText));
    rec("account shows Windows download link (installer configured)", (await pg.locator('a[href="/api/spell/download"]').count()) === 1);
    const dl = await pg.request.get(`${BASE}/api/spell/download`, { maxRedirects: 0 });
    rec("download redirects to the configured installer URL", dl.status() === 302 && (dl.headers()["location"] ?? "").startsWith("https://"), String(dl.status()));
    await pg.click("text=Кодыг харуулах");
    await pg.waitForSelector("text=Хуулах");
    const code = (await pg.textContent("main p.font-mono")) ?? "";
    rec("owner can reveal the licence code (audited reveal)", /^[A-Z0-9-]{10,}$/.test(code.trim()));

    // D. desktop: activate the PURCHASED licence with the real client over HTTP
    const smoke = spawnSync("npx", ["tsx", "scripts/spell-live-smoke.ts"], { env: { ...process.env, BASE, LICENSE_CODE: code.trim() }, encoding: "utf8", timeout: 120000 });
    const line = smoke.stdout.split("\n").find((l) => /steps passed/.test(l)) ?? "";
    rec("desktop client: activate → validate → check/replace → dictionary → transfer prompt → offline → deactivate with the purchased code", smoke.status === 0, line);

    // G. unauthorised user
    const other = await registerAndLogin(browser, `spellother-${tag}@e2e.test`);
    const s1 = await other.pg.request.get(`${BASE}/api/spell/purchase/${invoiceId}`);
    const s2 = await other.pg.request.post(`${BASE}/api/spell/licenses/${lic[0]!.id}/code`);
    const s3 = await other.pg.request.get(`${BASE}/api/spell/download`, { maxRedirects: 0 });
    const lst = (await (await other.pg.request.get(`${BASE}/api/spell/licenses`)).json()) as { licenses: unknown[] };
    rec("another user cannot read the purchase (404), reveal the code (404), download (403) or list the licence", s1.status() === 404 && s2.status() === 404 && s3.status() === 403 && lst.licenses.length === 0, `${s1.status()}/${s2.status()}/${s3.status()}/${lst.licenses.length}`);
    await other.pg.goto(`${BASE}/spell/license`, { waitUntil: "networkidle" });
    rec("another user's account page shows no licence", /байхгүй/.test((await other.pg.textContent("main")) ?? ""));
    await ctx.close();
    await other.ctx.close();
  } finally {
    await browser.close();
    mock.close();
    await prisma.$disconnect();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
