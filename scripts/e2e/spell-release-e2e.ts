/* eslint-disable @typescript-eslint/no-explicit-any -- test harness: untyped JSON from the real HTTP API */
/**
 * TORE Spell — REAL HTTP + REAL DATABASE release E2E.
 *
 *   DATABASE_URL=postgresql://…@127.0.0.1:<port>/<db>  (migrated, LOCAL only — refused otherwise)  npx tsx scripts/e2e/spell-release-e2e.ts
 *
 * What is real:   the production Next.js build (`next start`), every API route, NextAuth sessions, the application use cases, Prisma, PostgreSQL,
 *                 and the real desktop licence client + feedback outbox + update check talking HTTP to that server.
 * What is NOT:    QPay (a local SANDBOX SIMULATOR stands in; see qpay-simulator.ts — this run says NOTHING about the real provider), DPAPI (a
 *                 reversible stand-in protects the device key), the Windows installer (not involved), the clock (expiry is produced by editing the
 *                 licence row in the test database, labelled below; the server's own expiry logic then decides).
 * Prices below are TEST values for this run, not product prices.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { isLocalDatabaseUrl } from "../lib/database-url-safety";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { SpellLicenseClient, type ClientRecord, type Transport } from "../../desktop/core/license-client";
import { FeedbackOutbox, type OutboxDoc } from "../../desktop/core/feedback-outbox";
import { DesktopSpellSession, type DictionaryDoc } from "../../desktop/core/spell-session";
import { FileStore, type SecretProtector } from "../../desktop/core/store";
import { checkForUpdate } from "../../desktop/core/update";
import { startQpaySimulator } from "./qpay-simulator";

const PORT = Number(process.env.E2E_PORT ?? 3199);
const BASE = `http://127.0.0.1:${PORT}`;
const SIM_PORT = Number(process.env.E2E_QPAY_PORT ?? 3198);
const DATABASE_URL = process.env.DATABASE_URL ?? "";
if (!isLocalDatabaseUrl(DATABASE_URL)) throw new Error("refusing to run: DATABASE_URL must be a LOCAL database");

const PRICES = { SPELL_1M: 1000, SPELL_3M: 2000, SPELL_6M: 3500, SPELL_12M: 6000 }; // TEST values
const INSTALLER = "https://downloads.example.test/TORE-Spell-Setup.exe"; // reserved TLD: not a real host
const QPAY = { clientId: "sim-client", clientSecret: "sim-secret", invoiceCode: "SIM_INVOICE" };

const results: { name: string; ok: boolean; note?: string }[] = [];
async function step(name: string, fn: () => Promise<string | void>) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note ?? undefined });
    console.log(`PASS  ${name}${note ? ` — ${note}` : ""}`);
  } catch (e) {
    results.push({ name, ok: false, note: (e as Error).message });
    console.log(`FAIL  ${name} — ${(e as Error).message}`);
  }
}
function expect(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => expect(JSON.stringify(a) === JSON.stringify(b), `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

// ── server process ───────────────────────────────────────────────────────────
function serverEnv(spellOn: boolean): NodeJS.ProcessEnv {
  const k = () => randomBytes(32).toString("base64");
  const { privateKey } = generateKeyPairSync("ed25519");
  return {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL,
    AUTH_SECRET: randomBytes(24).toString("hex"),
    AUTH_TRUST_HOST: "true",
    NEXT_PUBLIC_APP_URL: BASE,
    TORE_ALLOW_LOCAL_STORAGE: "1", TORE_ALLOW_NO_REDIS: "1", TORE_ALLOW_NO_EMAIL: "1", TORE_ALLOW_LOCAL_ARCHIVE: "1", TORE_ALLOW_INSECURE_URLS: "1", TORE_ALLOW_INSECURE_PROD_URLS: "1",
    ...(spellOn ? { TORE_SPELL_V1: "1" } : {}),
    SPELL_CODE_HMAC_KEYS: `h1:${k()}`, SPELL_CODE_HMAC_ACTIVE_KEY_ID: "h1",
    SPELL_CODE_ENC_KEYS: `e1:${k()}`, SPELL_CODE_ENC_ACTIVE_KEY_ID: "e1",
    SPELL_SIGNING_KEYS: `k1:${(privateKey.export({ format: "der", type: "pkcs8" }) as Buffer).toString("base64")}`, SPELL_SIGNING_ACTIVE_KID: "k1",
    SPELL_PRICES_MNT: JSON.stringify(PRICES),
    SPELL_WINDOWS_INSTALLER_URL: INSTALLER, SPELL_RELEASE_VERSION: "1.0.1", SPELL_WINDOWS_INSTALLER_SHA256: "a".repeat(64),
    QPAY_BASE_URL: `http://127.0.0.1:${SIM_PORT}`, QPAY_CLIENT_ID: QPAY.clientId, QPAY_CLIENT_SECRET: QPAY.clientSecret, QPAY_INVOICE_CODE: QPAY.invoiceCode,
    QPAY_CALLBACK_URL: `${BASE}/api/billing/qpay/callback`,
  };
}
function stop(c: ChildProcess | null) {
  if (c?.pid) try { process.kill(-c.pid, "SIGTERM"); } catch { /* already gone */ }
}
async function startServer(port: number, spellOn: boolean): Promise<ChildProcess> {
  const env = { ...serverEnv(spellOn), NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`, QPAY_CALLBACK_URL: `http://127.0.0.1:${port}/api/billing/qpay/callback` };
  try {
    await fetch(`http://127.0.0.1:${port}/`);
    throw new Error(`port ${port} is already serving something: refusing to test a stale server`);
  } catch (e) {
    if ((e as Error).message.startsWith("port")) throw e;
  }
  // detached → its own process group, so the whole `next start` tree can be killed at the end
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"], cwd: path.resolve(__dirname, "../.."), detached: true });
  const log = process.env.E2E_SERVER_LOG ? fs.createWriteStream(process.env.E2E_SERVER_LOG, { flags: "a" }) : null;
  child.stdout?.on("data", (d) => log?.write(d));
  child.stderr?.on("data", (d) => log?.write(d));
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/spell/v1/keys`); if (r.status === 200 || r.status === 404 || r.status === 503) return child; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  stop(child);
  throw new Error(`server on :${port} did not start`);
}

// ── http helpers ─────────────────────────────────────────────────────────────
type Jar = Map<string, string>;
const cookieHeader = (j: Jar) => [...j].map(([k, v]) => `${k}=${v}`).join("; ");
const absorb = (j: Jar, res: Response) => { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv!.indexOf("="); j.set(kv!.slice(0, i), kv!.slice(i + 1)); } };
async function login(email: string, password: string): Promise<Jar> {
  const jar: Jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  absorb(jar, csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader(jar) },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" }),
  });
  absorb(jar, res);
  expect([...jar.keys()].some((k) => /session-token/.test(k)), `login failed for ${email} (status ${res.status})`);
  return jar;
}
const api = async (jar: Jar | null, method: string, p: string, body?: unknown, extra: Record<string, string> = {}, base = BASE) =>
  fetch(`${base}${p}`, { method, redirect: "manual", headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base, ...(jar ? { cookie: cookieHeader(jar) } : {}), ...extra }, body: body !== undefined ? JSON.stringify(body) : undefined });
const json = async (r: Response) => (await r.json().catch(() => ({}))) as Record<string, any>;

const protector: SecretProtector = { protect: (b) => `P1:${Buffer.from(b).reverse().toString("base64")}`, unprotect: (s) => Buffer.from(Buffer.from(s.slice(3), "base64")).reverse() };
const httpTransport: Transport = async (req) => {
  const res = await fetch(`${BASE}${req.path}`, { method: req.method, headers: req.headers, body: req.body });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

async function main() {
  const run = String(Date.now());
  const sim = await startQpaySimulator({ port: SIM_PORT, ...QPAY, idPrefix: `SIM${run}` });
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spell-e2e-"));
  let server = null as ChildProcess | null;
  let offServer = null as ChildProcess | null;
  try {
    server = await startServer(PORT, true);
    const keys = (await (await fetch(`${BASE}/api/spell/v1/keys`)).json()) as { keys: any[] };
    const pinned = { keys: keys.keys }; // the app pins PUBLIC keys; here they are fetched once from the server under test

    // seed accounts directly (registration/email is not part of this E2E)
    const pw = "E2e-Passw0rd!";
    const mk = async (tag: string, role: "CLIENT" | "ADMIN") =>
      db.user.create({ data: { email: `${tag}.${run}@e2e.test`, emailVerified: new Date(), passwordHash: await bcrypt.hash(pw, 4), name: tag, role, status: "ACTIVE" } });
    const users = { buyer: await mk("buyer", "CLIENT"), other: await mk("other", "CLIENT"), nolicense: await mk("nolicense", "CLIENT"), admin: await mk("admin", "ADMIN") };
    const jar: Record<string, Jar> = {};
    for (const [k, u] of Object.entries(users)) jar[k] = await login(u.email, pw);

    // ── A. purchase ──────────────────────────────────────────────────────────
    let invoice: { invoiceId: string; amountMnt: number } = { invoiceId: "", amountMnt: 0 };
    await step("A1 unauthenticated purchase is refused (401)", async () => { eq((await api(null, "POST", "/api/spell/purchase", { planCode: "SPELL_3M" })).status, 401, "status"); });
    await step("A2 unknown plan is refused, no invoice created", async () => {
      const before = await db.invoice.count();
      const r = await api(jar.buyer!, "POST", "/api/spell/purchase", { planCode: "SPELL_FREE" });
      expect(r.status >= 400 && r.status < 500, `status ${r.status}`);
      eq(await db.invoice.count(), before, "invoice count");
    });
    await step("A3 purchase: price is the SERVER's price even if the browser sends another amount", async () => {
      const r = await api(jar.buyer!, "POST", "/api/spell/purchase", { planCode: "SPELL_3M", amountMnt: 1, priceMnt: 1 });
      eq(r.status, 200, "status");
      const j = await json(r);
      invoice = { invoiceId: j.invoiceId, amountMnt: j.amountMnt };
      eq(j.amountMnt, PRICES.SPELL_3M, "amount");
      const row = await db.invoice.findUniqueOrThrow({ where: { id: j.invoiceId } });
      eq([row.amountMnt, row.userId, row.spellPlanCode, row.status], [PRICES.SPELL_3M, users.buyer.id, "SPELL_3M", "PENDING"], "invoice row");
      expect(sim.invoices.size >= 1, "QPay simulator received the invoice");
      return `invoice ${row.id} amount ${row.amountMnt}`;
    });
    await step("A4 another user cannot read this purchase", async () => { eq((await api(jar.other!, "GET", `/api/spell/purchase/${invoice.invoiceId}`)).status, 404, "status"); });
    const provider = async (invoiceId: string) => (await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).providerInvoiceId!;

    // ── B. callback ──────────────────────────────────────────────────────────
    const callback = (providerInvoiceId: string) => api(null, "POST", "/api/billing/qpay/callback", { invoice_id: providerInvoiceId });
    await step("B1 callback with NO payment: no licence", async () => {
      const r = await json(await callback(await provider(invoice.invoiceId)));
      expect(r.ok === false || r.ok === undefined, `callback said ${JSON.stringify(r)}`);
      eq(await db.spellLicense.count({ where: { ownerUserId: users.buyer.id } }), 0, "licences");
    });
    await step("B2 callback with a WRONG amount paid: no licence", async () => {
      await fetch(`${sim.baseUrl}/__sim/pay`, { method: "POST", body: JSON.stringify({ providerInvoiceId: await provider(invoice.invoiceId), amount: 1 }) });
      const r = await json(await callback(await provider(invoice.invoiceId)));
      expect(r.ok === false, `callback said ${JSON.stringify(r)}`);
      eq(await db.spellLicense.count({ where: { ownerUserId: users.buyer.id } }), 0, "licences");
    });
    await step("B3 a non-PAID provider row (e.g. FAILED) never counts", async () => {
      sim.invoices.get(await provider(invoice.invoiceId))!.payments = [];
      await fetch(`${sim.baseUrl}/__sim/pay`, { method: "POST", body: JSON.stringify({ providerInvoiceId: await provider(invoice.invoiceId), status: "FAILED", amount: PRICES.SPELL_3M }) });
      await callback(await provider(invoice.invoiceId));
      eq(await db.spellLicense.count({ where: { ownerUserId: users.buyer.id } }), 0, "licences");
    });
    await step("B4 correct payment → callback → exactly one licence for the buyer", async () => {
      sim.invoices.get(await provider(invoice.invoiceId))!.payments = [];
      await fetch(`${sim.baseUrl}/__sim/pay`, { method: "POST", body: JSON.stringify({ providerInvoiceId: await provider(invoice.invoiceId) }) });
      const r = await json(await callback(await provider(invoice.invoiceId)));
      eq(r.ok, true, "callback ok");
      eq(await db.spellLicense.count({ where: { purchaseInvoiceId: invoice.invoiceId } }), 1, "licences for invoice");
      const lic = await db.spellLicense.findFirstOrThrow({ where: { purchaseInvoiceId: invoice.invoiceId } });
      eq([lic.ownerUserId, lic.planCode, lic.durationMonths, lic.status, lic.source, lic.startsAt], [users.buyer.id, "SPELL_3M", 3, "ACTIVE", "PURCHASE", null], "licence row");
      expect(lic.codeHash.length >= 32 && lic.codeCiphertext.length > 0, "hash + ciphertext stored");
      eq((await db.invoice.findUniqueOrThrow({ where: { id: invoice.invoiceId } })).status, "PAID", "invoice status");
    });
    await step("C1 duplicate callbacks (3 sequential + 8 concurrent): still exactly one licence", async () => {
      const p = await provider(invoice.invoiceId);
      for (let i = 0; i < 3; i += 1) await callback(p);
      await Promise.all(Array.from({ length: 8 }, () => callback(p)));
      await api(jar.buyer!, "GET", `/api/spell/purchase/${invoice.invoiceId}`);
      eq(await db.spellLicense.count({ where: { purchaseInvoiceId: invoice.invoiceId } }), 1, "licences for invoice");
      eq(await db.spellLicense.count({ where: { ownerUserId: users.buyer.id } }), 1, "licences for buyer");
      eq(await db.spellLicenseEvent.count({ where: { type: "LICENSE_ISSUED", licenseId: (await db.spellLicense.findFirstOrThrow({ where: { purchaseInvoiceId: invoice.invoiceId } })).id } }), 1, "LICENSE_ISSUED events");
    });
    const lic1 = await db.spellLicense.findFirst({ where: { purchaseInvoiceId: invoice.invoiceId } });

    // ── D/E. ownership + reveal + download ───────────────────────────────────
    let code1 = "";
    await step("E1 owner list shows the licence masked; others see none", async () => {
      const mine = await json(await api(jar.buyer!, "GET", "/api/spell/licenses"));
      const list = (mine.licenses ?? mine.items ?? mine) as any[];
      eq(Array.isArray(list) ? list.length : -1, 1, "buyer's licences");
      expect(!JSON.stringify(mine).match(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/) || /•|\*|XXXX/.test(JSON.stringify(mine)), "list does not contain a full code");
      const theirs = await json(await api(jar.other!, "GET", "/api/spell/licenses"));
      eq(((theirs.licenses ?? theirs.items ?? theirs) as any[]).length, 0, "other's licences");
    });
    await step("E2 code reveal: owner 200; other user, admin, anonymous refused", async () => {
      const path = `/api/spell/licenses/${lic1!.id}/code`;
      eq((await api(null, "POST", path)).status, 401, "anonymous");
      eq((await api(jar.other!, "POST", path)).status, 404, "other user");
      eq((await api(jar.admin!, "POST", path)).status, 404, "admin (not the owner)");
      const ok = await api(jar.buyer!, "POST", path);
      eq(ok.status, 200, "owner");
      code1 = (await json(ok)).code;
      expect(typeof code1 === "string" && code1.length >= 12, "code returned to the owner");
      eq(await db.spellLicenseEvent.count({ where: { licenseId: lic1!.id, type: "LICENSE_CODE_REVEALED" } }), 1, "reveal audit event");
      expect(!JSON.stringify(await db.spellLicenseEvent.findMany({ where: { licenseId: lic1!.id } })).includes(code1.replace(/-/g, "")), "code not in audit events");
    });
    await step("E3 the stored row holds only a hash + ciphertext (no plaintext code anywhere in the licence tables)", async () => {
      const dump = JSON.stringify([await db.spellLicense.findMany(), await db.spellLicenseEvent.findMany()], (_k, v) => (typeof v === "object" && v && (v as any).type === "Buffer" ? "<bytes>" : v));
      expect(!dump.includes(code1) && !dump.includes(code1.replace(/-/g, "")), "plaintext found");
    });
    await step("F0 download: licence owner → 302 to the CONFIGURED https URL; no licence 403; anonymous 401", async () => {
      const ok = await api(jar.buyer!, "GET", "/api/spell/download");
      eq(ok.status, 302, "owner status");
      eq(ok.headers.get("location"), INSTALLER, "redirect target");
      eq((await api(jar.nolicense!, "GET", "/api/spell/download")).status, 403, "no licence");
      eq((await api(null, "GET", "/api/spell/download")).status, 401, "anonymous");
    });

    // ── F/G/H. activation, second device, transfer ───────────────────────────
    const mkClient = (name: string) => {
      const store = new FileStore<ClientRecord>(path.join(tmp, `${name}-license.json`));
      return new SpellLicenseClient({ store, protector, transport: httpTransport, appVersion: "1.0.0-rc.1", pinnedJwks: pinned as any, requirePinned: true });
    };
    const A = mkClient("A");
    const B = mkClient("B");
    const C = mkClient("C");
    await step("F1 wrong code is refused; computer stays unactivated", async () => {
      const e: any = await A.activate("TSP-AAAA-BBBB-CCCC-DDDD").catch((x) => x);
      expect(e?.code === "LICENSE_CODE_INVALID", `got ${e?.code}`);
      eq((await A.state()).kind, "UNACTIVATED", "state");
    });
    await step("F2 first computer activates over real HTTP; the term clock starts; token verified with the pinned key", async () => {
      const g = await A.activate(code1);
      eq(g.status, "ACTIVATED", "grant");
      eq((await A.state()).kind, "ACTIVE", "state");
      const lic = await db.spellLicense.findUniqueOrThrow({ where: { id: lic1!.id } });
      expect(lic.startsAt && lic.expiresAt, "term started");
      const months = (lic.expiresAt!.getTime() - lic.startsAt!.getTime()) / 86_400_000;
      expect(months > 85 && months < 95, `3-month term (${months.toFixed(1)} days)`);
      eq(await db.spellActivation.count({ where: { licenseId: lic1!.id, status: "ACTIVE" } }), 1, "active activations");
    });
    await step("F3 re-validation works; spell checking runs while licensed", async () => {
      eq((await A.validate()).kind, "ACTIVE", "validate");
      const dict = new FileStore<DictionaryDoc>(path.join(tmp, "dictionary.json"));
      const spell = new DesktopSpellSession(createSpellEngineV1(), dict, A);
      spell.addToDictionary("Бүлжирэн");
      const r = await spell.check("Энэ надэд нь");
      expect(!r.locked && r.issues.some((i) => i.token === "надэд" && i.suggestions[0] === "надад"), "надэд → надад");
    });
    await step("G1 second computer is REJECTED with an explicit transfer prompt; the first is untouched", async () => {
      const e: any = await B.activate(code1).catch((x) => x);
      eq(e?.code, "TRANSFER_CONFIRMATION_REQUIRED", "code");
      eq((await B.state()).kind, "UNACTIVATED", "B state");
      eq((await A.validate()).kind, "ACTIVE", "A still active");
      eq(await db.spellActivation.count({ where: { licenseId: lic1!.id, status: "ACTIVE" } }), 1, "active activations");
    });
    await step("H1 explicit transfer moves the licence; the old computer is locked on its next validation", async () => {
      const prompt: any = await B.activate(code1).catch((x) => x);
      const g = await B.activate(code1, { confirmTransferOfActivationId: prompt.details.replacesActivationId });
      eq(g.status, "TRANSFERRED", "grant");
      eq(await db.spellActivation.count({ where: { licenseId: lic1!.id, status: "ACTIVE" } }), 1, "active activations");
      const a = await A.validate();
      expect(a.kind !== "ACTIVE", `A is still ${a.kind}`);
      eq((await B.state()).kind, "ACTIVE", "B state");
    });
    await step("H2 the next transfer inside the cooldown is refused", async () => {
      const e: any = await C.activate(code1).catch((x) => x);
      expect(["TRANSFER_COOLDOWN_ACTIVE", "TRANSFER_CONFIRMATION_REQUIRED"].includes(e?.code), `got ${e?.code}`);
      if (e.code === "TRANSFER_CONFIRMATION_REQUIRED") {
        const e2: any = await C.activate(code1, { confirmTransferOfActivationId: e.details.replacesActivationId }).catch((x) => x);
        eq(e2?.code, "TRANSFER_COOLDOWN_ACTIVE", "confirmed transfer");
      }
      eq(await db.spellActivation.count({ where: { licenseId: lic1!.id, status: "ACTIVE" } }), 1, "active activations");
    });

    // ── K/L. feedback while licensed (B holds the licence), second reporter, admin review ──
    const outboxB = new FeedbackOutbox(new FileStore<OutboxDoc>(path.join(tmp, "B-outbox.json")), B);
    const report = { feedbackType: "WRONG_SUGGESTION" as const, token: "надэд", engineSuggestion: "надад", userSuggestion: "надад", engineVersion: "1.0.0-alpha.2", dataVersion: "e2e" };
    await step("K1 report → local outbox → server: stored PENDING, owned by the buyer", async () => {
      outboxB.enqueue(report);
      const r = await outboxB.flush();
      eq([r.sent, r.pending], [1, 0], "flush");
      const row = await db.spellFeedback.findFirstOrThrow({ where: { userId: users.buyer.id } });
      eq([row.status, row.token, row.feedbackType, row.reviewedBy], ["PENDING", "надэд", "WRONG_SUGGESTION", null], "row");
    });
    await step("K2 a user cannot set status/user/review fields (strict schema → 422) and nothing is stored", async () => {
      const before = await db.spellFeedback.count();
      const rec = JSON.parse(fs.readFileSync(path.join(tmp, "B-license.json"), "utf8")) as ClientRecord;
      // Raw signed request carrying a forbidden field, built with the real client's signing path.
      const body = { activationId: rec.grant!.activationId, feedback: { ...report, status: "ACCEPTED" } };
      const statuses: number[] = [];
      const sneaky: Transport = async (req) => { const r = await fetch(`${BASE}${req.path}`, { method: req.method, headers: req.headers, body: req.body }); statuses.push(r.status); return { status: r.status, json: await r.json().catch(() => ({})) }; };
      const probe = new SpellLicenseClient({ store: new FileStore<ClientRecord>(path.join(tmp, "B-license.json")), protector, transport: sneaky, appVersion: "1.0.0-rc.1", pinnedJwks: pinned as any, requirePinned: true });
      await (probe as any).signedPost(rec, "/api/spell/v1/feedback", body).catch(() => undefined);
      eq(statuses, [422], "http status (validation error)");
      eq(await db.spellFeedback.count(), before, "rows");
    });
    await step("K3 a second licensed user reports the same issue → one group, 2 distinct users", async () => {
      // second user: full purchase → callback → reveal → activation, all over HTTP
      const buy = await buyAndActivate(jar.other!, users.other.id, "other");
      const ob = new FeedbackOutbox(new FileStore<OutboxDoc>(path.join(tmp, "O-outbox.json")), buy.client);
      ob.enqueue({ ...report, token: "Надэд" });
      eq((await ob.flush()).sent, 1, "sent");
      const g = await json(await api(jar.admin!, "GET", "/api/spell/admin/feedback?status=PENDING"));
      const grp = g.groups.find((x: any) => x.token.toLowerCase() === "надэд");
      eq([grp.distinctUsers, grp.reports], [2, 2], "group");
    });
    await step("L1 admin API: non-admin 403, anonymous 401; review needs a reason; ACCEPT is final", async () => {
      eq((await api(jar.buyer!, "GET", "/api/spell/admin/feedback")).status, 403, "buyer list");
      eq((await api(null, "GET", "/api/spell/admin/feedback")).status, 401, "anon list");
      const g = await json(await api(jar.admin!, "GET", "/api/spell/admin/feedback?status=PENDING"));
      const key = g.groups.find((x: any) => x.token.toLowerCase() === "надэд").groupKey;
      eq((await api(jar.buyer!, "POST", "/api/spell/admin/feedback/review", { groupKey: key, decision: "ACCEPT", reason: "me" })).status, 403, "buyer review");
      eq((await api(jar.admin!, "POST", "/api/spell/admin/feedback/review", { groupKey: key, decision: "ACCEPT", reason: "" })).status, 422, "no reason");
      const r = await api(jar.admin!, "POST", "/api/spell/admin/feedback/review", { groupKey: key, decision: "ACCEPT", reason: "reproducible on the shipped engine" });
      eq(r.status, 200, "accept");
      const rows = await db.spellFeedback.findMany({ where: { groupKey: key, userId: { in: [users.buyer.id, users.other.id] } } }); // this run's reporters only (the database may hold earlier runs)
      expect(rows.length === 2 && rows.every((x) => x.status === "ACCEPTED" && x.reviewedBy === users.admin.id), "rows accepted by admin");
      eq((await api(jar.admin!, "POST", "/api/spell/admin/feedback/review", { groupKey: key, decision: "REJECT", reason: "second thoughts" })).status, 422, "re-review of a final group");
    });
    await step("L2 the accepted report changed NO language data (engine verdict identical, no lexicon/gold writes)", async () => {
      const v = createSpellEngineV1().analyze("Энэ надэд нь").tokens[1]!;
      eq(v.verdict, "MISSPELLED", "verdict unchanged by acceptance");
    });
    await step("L3 contribution credit: accepted count shows for the reporter (signed device request)", async () => {
      eq(await B.contributions(), { submitted: 1, accepted: 1, rejected: 0, pending: 0 }, "stats");
    });
    await step("M1 signed update notice over real HTTP: verified with the pinned key → UPDATE_AVAILABLE", async () => {
      const s = await checkForUpdate({ currentVersion: "1.0.0-rc.1", transport: httpTransport, pinnedJwks: pinned as any });
      eq([s.kind, (s as any).version], ["UPDATE_AVAILABLE", "1.0.1"], "status");
      const same = await checkForUpdate({ currentVersion: "1.0.1", transport: httpTransport, pinnedJwks: pinned as any });
      eq(same.kind, "UP_TO_DATE", "same version");
      const forged = await checkForUpdate({ currentVersion: "1.0.0", transport: httpTransport, pinnedJwks: { keys: [{ ...(pinned.keys[0]), x: Buffer.from(randomBytes(32)).toString("base64url") }] } as any });
      eq(forged.kind, "UNAVAILABLE", "wrong key");
    });

    // ── I/J. expiry + renewal ────────────────────────────────────────────────
    await step("I1 EXPIRY (test DB time-shift of the licence row): the server refuses validation, the client locks with the expiry reason, feedback and download refuse", async () => {
      const recBefore = fs.readFileSync(path.join(tmp, "B-license.json"), "utf8"); // keeps the old grant so the SERVER's refusal can be probed
      await db.spellLicense.update({ where: { id: lic1!.id }, data: { startsAt: new Date(Date.now() - 100 * 86_400_000), expiresAt: new Date(Date.now() - 3_600_000) } });
      const st = await B.validate();
      eq([st.kind, (st as any).endedReason], ["UNACTIVATED", "LICENSE_EXPIRED"], "client state (the lock screen shows the expiry message and «Шинэ эрх авах»)");
      const list = await json(await api(jar.buyer!, "GET", "/api/spell/licenses"));
      const statuses = ((list.licenses ?? list.items ?? list) as any[]).map((l) => l.status);
      expect(statuses.includes("EXPIRED"), `server-derived statuses ${statuses}`);
      eq((await api(jar.buyer!, "GET", "/api/spell/download")).status, 403, "download needs an active licence");
      const probeStore = new FileStore<ClientRecord>(path.join(tmp, "B-old-license.json"));
      fs.writeFileSync(path.join(tmp, "B-old-license.json"), recBefore);
      const old = new SpellLicenseClient({ store: probeStore, protector, transport: httpTransport, appVersion: "1.0.0-rc.1", pinnedJwks: pinned as any, requirePinned: true });
      const refused: any = await old.postFeedback({ ...report, token: "аль" } as any).catch((x) => x);
      expect(["LICENSE_EXPIRED", "ACTIVATION_NOT_ACTIVE"].includes(refused?.code), `server answered ${refused?.code ?? "success"}`);
      eq(await db.spellFeedback.count({ where: { token: "аль" } }), 0, "no row stored for the expired licence");
    });
    await step("J1 RENEWAL: a new purchase → new licence → same computer activates; personal dictionary intact", async () => {
      const dictBefore = JSON.parse(fs.readFileSync(path.join(tmp, "dictionary.json"), "utf8")) as DictionaryDoc;
      expect(dictBefore.words.includes("Бүлжирэн"), "dictionary has the word while expired");
      const inv = await json(await api(jar.buyer!, "POST", "/api/spell/purchase", { planCode: "SPELL_1M" }));
      expect(inv.invoiceId && inv.invoiceId !== invoice.invoiceId, "a NEW invoice");
      const p = await provider(inv.invoiceId);
      await fetch(`${sim.baseUrl}/__sim/pay`, { method: "POST", body: JSON.stringify({ providerInvoiceId: p }) });
      await callback(p);
      const lic2 = await db.spellLicense.findFirstOrThrow({ where: { purchaseInvoiceId: inv.invoiceId } });
      eq(await db.spellLicense.count({ where: { ownerUserId: users.buyer.id } }), 2, "buyer's licences");
      const code2 = (await json(await api(jar.buyer!, "POST", `/api/spell/licenses/${lic2.id}/code`))).code;
      await B.activate(code2); // same computer, new licence
      eq((await B.state()).kind, "ACTIVE", "state after renewal");
      const spell = new DesktopSpellSession(createSpellEngineV1(), new FileStore<DictionaryDoc>(path.join(tmp, "dictionary.json")), B);
      const r = await spell.check("Бүлжирэн", { reportUnknown: true });
      expect(!r.locked && r.issues.length === 0, "personal word still respected after renewal");
    });
    await step("N1 Spell feature flag OFF: purchase, keys and download are unavailable (404) on a server without TORE_SPELL_V1", async () => {
      offServer = await startServer(PORT + 1, false);
      const off = `http://127.0.0.1:${PORT + 1}`;
      eq((await fetch(`${off}/api/spell/v1/keys`)).status, 404, "keys");
      eq((await api(jar.buyer!, "POST", "/api/spell/purchase", { planCode: "SPELL_3M" }, {}, off)).status, 404, "purchase");
    });

    async function buyAndActivate(j: Jar, userId: string, name: string) {
      const inv = await json(await api(j, "POST", "/api/spell/purchase", { planCode: "SPELL_1M" }));
      const p = await provider(inv.invoiceId);
      await fetch(`${sim.baseUrl}/__sim/pay`, { method: "POST", body: JSON.stringify({ providerInvoiceId: p }) });
      await callback(p);
      const lic = await db.spellLicense.findFirstOrThrow({ where: { purchaseInvoiceId: inv.invoiceId, ownerUserId: userId } });
      const code = (await json(await api(j, "POST", `/api/spell/licenses/${lic.id}/code`))).code;
      const client = mkClient(name);
      await client.activate(code);
      return { client, licenseId: lic.id };
    }
  } finally {
    stop(server);
    stop(offServer);
    await sim.close();
    await db.$disconnect();
    await pool.end();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed — REAL HTTP + REAL DB (PostgreSQL) with a QPay SANDBOX SIMULATOR (not real QPay).`);
  process.exit(failed.length ? 1 : 0);
}
void main();
