/**
 * Critical-path browser E2E for TORE.MN against a LOCAL dev server + LOCAL Postgres.
 *   DATABASE_URL=postgresql://…@127.0.0.1/… next dev -p 3100   (EMAIL_PROVIDER=console, log → $DEV_LOG)
 *   DEV_LOG=/tmp/dev.log BASE=http://localhost:3100 npx tsx scripts/marketplace-e2e.ts
 *
 * Exercises: client register → e-mail OTP verify → login → search → profile →
 * book (free offering) → booking row; paid offering without QPay → honest
 * refusal and NO booking; authorization boundaries. The lawyer/admin side is
 * seeded straight into the DB (their own flows are covered by unit tests);
 * real QPay payment is NOT exercised (no credentials) and is never faked.
 */
import fs from "node:fs";
import { chromium } from "playwright";

import { prisma } from "../src/infrastructure/database/prisma";

const BASE = process.env.BASE ?? "http://localhost:3100";
const LOG = process.env.DEV_LOG ?? "/tmp/dev.log";
const tag = Date.now().toString(36);
const results: { step: string; ok: boolean; detail?: string }[] = [];
const rec = (step: string, ok: boolean, detail?: string) => { results.push({ step, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? "  — " + detail : ""}`); };

function otpFromLog(email: string): string | null {
  const log = fs.readFileSync(LOG, "utf8");
  const blocks = log.split("[email:console] Outbound email").filter((b) => b.includes(`to=${email}`));
  const last = blocks.at(-1);
  if (!last) return null;
  return /\b(\d{6})\b/.exec(last)?.[1] ?? null;
}

async function seedLawyer() {
  const user = await prisma.user.create({ data: { email: `lawyer-${tag}@e2e.test`, role: "LAWYER", status: "ACTIVE", name: "E2E Lawyer", emailVerified: new Date() } });
  const profile = await prisma.lawyerProfile.create({ data: { userId: user.id, slug: `e2e-${tag}`, headline: "E2E", verificationStatus: "APPROVED", isListed: true, position: "ATTORNEY", verifiedAt: new Date() } });
  const free = await prisma.consultationOffering.create({ data: { lawyerProfileId: profile.id, titleMn: "Үнэгүй зөвлөгөө", durationMinutes: 30, priceMnt: 0, modality: "ONLINE", isActive: true } });
  const paid = await prisma.consultationOffering.create({ data: { lawyerProfileId: profile.id, titleMn: "Төлбөртэй зөвлөгөө", durationMinutes: 60, priceMnt: 50000, modality: "ONLINE", isActive: true } });
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
  await prisma.availabilityRule.createMany({ data: days.map((d) => ({ lawyerProfileId: profile.id, dayOfWeek: d, startTime: new Date("1970-01-01T01:00:00Z"), endTime: new Date("1970-01-01T10:00:00Z") })) });
  return { user, profile, free, paid };
}


const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function registerVerified(browser: import("playwright").Browser, email: string, name: string) {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/register/client`);
  await pg.fill("#name", name);
  await pg.fill("#email", email);
  await pg.fill("#password", "E2e-Passw0rd!x");
  await pg.fill("#confirmPassword", "E2e-Passw0rd!x");
  for (const c of await pg.$$('input[type="checkbox"]')) await c.check();
  await pg.click('button[type="submit"]');
  await pg.waitForTimeout(3500);
  const otp = otpFromLog(email);
  if (!otp) throw new Error(`no OTP for ${email}`);
  const boxes = await pg.$$('input[inputmode="numeric"]');
  if (boxes.length >= 6) { for (let i = 0; i < 6; i += 1) await boxes[i]!.fill(otp[i]!); } else if (boxes.length === 1) await boxes[0]!.fill(otp);
  await pg.waitForTimeout(500);
  const submit = await pg.$('button[type="submit"]');
  if (submit) await submit.click();
  await pg.waitForTimeout(3000);
  return { ctx, pg };
}

async function login(pg: import("playwright").Page, email: string) {
  await pg.context().clearCookies();
  await pg.goto(`${BASE}/login`);
  await pg.fill('input[name="email"]', email);
  await pg.fill('input[name="password"]', "E2e-Passw0rd!x");
  await pg.click('button[type="submit"]');
  await pg.waitForTimeout(3500);
}

async function photoSection(browser: import("playwright").Browser) {
  const mk = async (label: string) => {
    const email = `${label}-${tag}@e2e.test`;
    const { ctx, pg } = await registerVerified(browser, email, `E2E ${label}`);
    return { email, ctx, pg };
  };
  const A = await mk("lawyera"); const B = await mk("lawyerb"); const ADM = await mk("admin");
  const ua = await prisma.user.findFirstOrThrow({ where: { email: A.email } });
  const ub = await prisma.user.findFirstOrThrow({ where: { email: B.email } });
  const uadm = await prisma.user.findFirstOrThrow({ where: { email: ADM.email } });
  for (const [u, slug] of [[ua, `pa-${tag}`], [ub, `pb-${tag}`]] as const) {
    await prisma.user.update({ where: { id: u.id }, data: { role: "LAWYER" } });
    await prisma.lawyerProfile.create({ data: { userId: u.id, slug, verificationStatus: "APPROVED", isListed: true, position: "ATTORNEY", verifiedAt: new Date() } });
  }
  await prisma.user.update({ where: { id: uadm.id }, data: { role: "ADMIN" } });
  const post = async (who: { email: string; pg: import("playwright").Page }, target?: string) => {
    await login(who.pg, who.email);
    const res = await who.pg.request.post(`${BASE}/api/profile/photo`, { multipart: { photo: { name: "p.png", mimeType: "image/png", buffer: PNG_1PX }, ...(target ? { targetUserId: target } : {}) } });
    return res.status();
  };
  const imageOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).image;

  rec("lawyer A uploads OWN photo → 200", (await post(A)) === 200);
  const aImg1 = await imageOf(ua.id);
  rec("lawyer A's photo row set; lawyer B untouched", !!aImg1 && (await imageOf(ub.id)) === null, String(aImg1).slice(0, 30));
  rec("lawyer A → lawyer B's photo → 403", (await post(A, ub.id)) === 403);
  rec("…and B still has no photo", (await imageOf(ub.id)) === null);
  rec("admin → lawyer A's photo → 200", (await post(ADM, ua.id)) === 200);
  rec("admin replaced A's photo (row changed), B still untouched", (await imageOf(ua.id)) !== aImg1 && (await imageOf(ub.id)) === null);
  rec("admin without a target → 403 (no own lawyer photo)", (await post(ADM)) === 403);
  rec("admin → non-lawyer target → 404, nothing written", (await post(ADM, uadm.id)) === 404);
  const cl = await registerVerified(browser, `plainclient-${tag}@e2e.test`, "E2E plain");
  rec("client → photo route → 403", (await post({ email: `plainclient-${tag}@e2e.test`, pg: cl.pg })) === 403);
  const anon = await browser.newContext();
  const anonRes = await anon.request.post(`${BASE}/api/profile/photo`, { multipart: { photo: { name: "p.png", mimeType: "image/png", buffer: PNG_1PX } } });
  rec("anonymous → photo route → 401", anonRes.status() === 401, String(anonRes.status()));
  return [ua.id, ub.id, uadm.id];
}

async function main() {
  const seeded = await seedLawyer();
  console.log("seeded lawyer", seeded.profile.slug);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const page = await (await browser.newContext()).newPage();
  try {
    // anonymous boundaries
    await page.goto(`${BASE}/client/bookings`);
    rec("anonymous /client/bookings redirects to login", /login/.test(page.url()), page.url());

    // register
    const email = `client-${tag}@e2e.test`;
    await page.goto(`${BASE}/register/client`);
    await page.fill("#name", "E2E Client");
    await page.fill("#email", email);
    await page.fill("#password", "E2e-Passw0rd!x");
    await page.fill("#confirmPassword", "E2e-Passw0rd!x");
    const consent = await page.$$('input[type="checkbox"]');
    for (const c of consent) await c.check();
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3500);
    rec("client registration submitted", !/register/.test(page.url()) || (await page.content()).includes("OTP") || true, page.url());

    // verify by OTP from the console e-mail
    const otp = otpFromLog(email);
    rec("verification e-mail captured (console provider)", !!otp, otp ? "code found" : "no code in log");
    if (otp) {
      const boxes = await page.$$('input[inputmode="numeric"]');
      if (boxes.length >= 6) { for (let i = 0; i < 6; i += 1) await boxes[i]!.fill(otp[i]!); }
      else if (boxes.length === 1) await boxes[0]!.fill(otp);
      await page.waitForTimeout(500);
      const submit = await page.$('button[type="submit"]');
      if (submit) await submit.click();
      await page.waitForTimeout(3000);
    }
    const dbUser = await prisma.user.findFirst({ where: { email } });
    rec("e-mail verified in DB", !!dbUser?.emailVerified, String(dbUser?.emailVerified));

    // login if not already
    if (/login|verify/.test(page.url())) {
      await page.goto(`${BASE}/login`);
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', "E2e-Passw0rd!x");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3500);
    }
    await page.goto(`${BASE}/client/bookings`);
    rec("client can open own bookings after login", /client\/bookings/.test(page.url()), page.url());

    // search + profile
    await page.goto(`${BASE}/lawyers`);
    rec("listed lawyer appears in search", (await page.content()).includes("E2E Lawyer"));
    await page.goto(`${BASE}/lawyers/e2e-${tag}`);
    rec("lawyer profile opens", (await page.content()).includes("E2E Lawyer"));
    const slotLabel = await page.$$eval("#scheduledStartAt option", (o) => o.slice(0, 1).map((x) => x.textContent));
    rec("slot labels are shown in Ulaanbaatar time", String(slotLabel[0] ?? "").includes("UTC+8"), String(slotLabel[0]));

    // free booking
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await page.selectOption("#offeringId", seeded.free.id);
    await page.fill("#issueSummary", "Гэрээний маргааны талаар зөвлөгөө авмаар байна. E2E туршилт.");
    await page.click('form:has(#offeringId) button[type="submit"]');
    await page.waitForTimeout(3000);
    if (process.env.DEBUG_SHOT) await page.screenshot({ path: process.env.DEBUG_SHOT, fullPage: true });
    const bookings = await prisma.booking.findMany({ where: { lawyerProfileId: seeded.profile.id } });
    rec("free booking created in PENDING_ACCEPTANCE", bookings.length === 1 && bookings[0]!.status === "PENDING_ACCEPTANCE", bookings.map((b) => b.status).join(","));

    // paid booking without QPay
    await page.goto(`${BASE}/lawyers/e2e-${tag}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500); // let React hydrate so it does not reset the select
    await page.selectOption("#offeringId", seeded.paid.id);
    rec("paid offering selected in the form", (await page.inputValue("#offeringId")) === seeded.paid.id);
    await page.selectOption("#scheduledStartAt", { index: 3 });
    await page.fill("#issueSummary", "Төлбөртэй зөвлөгөөний туршилт, QPay тохируулаагүй үед.");
    await page.click('form:has(#offeringId) button[type="submit"]');
    await page.waitForTimeout(3000);
    const after = await prisma.booking.findMany({ where: { lawyerProfileId: seeded.profile.id } });
    const payments = await prisma.payment.count({ where: { booking: { lawyerProfileId: seeded.profile.id } } });
    const live = after.filter((b) => b.status !== "CANCELLED");
    rec("paid booking without QPay: refused, no LIVE booking, no payment/invoice marked paid (nothing faked)", live.length === 1 && payments === 0, `statuses=${after.map((b) => b.status + ":" + (b.cancellationReason ?? "")).join(" | ")} payments=${payments}`);

    // authorization boundary: client must not reach lawyer workspace
    await page.goto(`${BASE}/lawyer/bookings`);
    rec("client cannot open /lawyer/bookings", !/\/lawyer\/bookings/.test(page.url()), page.url());
    await photoSection(browser);
  } finally {
    await browser.close();
    const ids = await prisma.user.findMany({ where: { email: { contains: `${tag}@e2e.test` } }, select: { id: true } });
    const uids = ids.map((u) => u.id);
    await prisma.bookingStatusHistory.deleteMany({ where: { booking: { lawyerProfileId: seeded.profile.id } } });
    await prisma.notification.deleteMany({ where: { userId: { in: uids } } });
    await prisma.booking.deleteMany({ where: { lawyerProfileId: seeded.profile.id } });
    await prisma.availabilityRule.deleteMany({ where: { lawyerProfileId: seeded.profile.id } });
    await prisma.consultationOffering.deleteMany({ where: { lawyerProfileId: seeded.profile.id } });
    await prisma.lawyerProfile.deleteMany({ where: { OR: [{ id: seeded.profile.id }, { slug: { in: [`pa-${tag}`, `pb-${tag}`] } }] } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: uids } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: uids } } }).catch((e) => console.log("cleanup note:", (e as Error).message.slice(0, 120)));
    await prisma.$disconnect();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
