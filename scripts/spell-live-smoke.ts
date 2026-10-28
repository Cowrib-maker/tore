/**
 * Live smoke test of TORE Spell against a REAL server over HTTP, using the
 * shipped desktop client with the shipped PINNED production public key.
 *
 *   BASE=https://www.tore.mn  [LICENSE_CODE=TORE-…]  npx tsx scripts/spell-live-smoke.ts
 *
 * Without LICENSE_CODE only the read-only preflight runs (GET /api/spell/v1/keys):
 * is Spell enabled, configured, and serving exactly the pinned key id(s)?
 * With a code (a fresh, throw-away beta license!) it runs the full flow:
 * activate → validate → check/replace/dictionary → second computer needs
 * transfer confirmation → offline → offline limit → deactivate.
 * Never prints the code, tokens or keys.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createSpellEngineV1 } from "../src/spell-engine/bundled";
import { SpellLicenseClient, type ClientRecord, type Transport } from "../desktop/core/license-client";
import { DesktopSpellSession, type DictionaryDoc } from "../desktop/core/spell-session";
import { MemoryStore, type SecretProtector } from "../desktop/core/store";

const BASE = process.env.BASE ?? "https://www.tore.mn";
const CODE = process.env.LICENSE_CODE;
const pinnedFile = process.env.PINNED_KEYS ?? path.resolve(__dirname, "../desktop/config/pinned-keys.production.json");
const pinned = JSON.parse(fs.readFileSync(pinnedFile, "utf8")) as { keys: { kid: string }[] };

const results: { step: string; ok: boolean; detail?: string }[] = [];
const rec = (step: string, ok: boolean, detail?: string) => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? "  — " + detail : ""}`);
};

const transport: Transport = async (req) => {
  const res = await fetch(new URL(req.path, BASE), { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(15_000) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};
const protector: SecretProtector = { protect: (b) => Buffer.from(b).toString("base64"), unprotect: (s) => Buffer.from(s, "base64") };
void os;

async function main() {
  // ── preflight (read-only) ────────────────────────────────────────────────
  let status = 0;
  let body: { keys?: { kid?: string; d?: string }[]; code?: string } = {};
  try {
    const res = await fetch(new URL("/api/spell/v1/keys", BASE), { signal: AbortSignal.timeout(15_000) });
    status = res.status;
    body = await res.json().catch(() => ({}));
  } catch (e) {
    rec("server reachable", false, (e as Error).message);
    return finish();
  }
  rec("server reachable", status !== 0, `HTTP ${status}`);
  if (status === 404 && body.code === "SPELL_DISABLED") { rec("Spell enabled on server (TORE_SPELL_V1=1)", false, "SPELL_DISABLED"); return finish(); }
  if (status === 503) { rec("Spell configured on server (signing + vault keys)", false, "SPELL_NOT_CONFIGURED"); return finish(); }
  if (status !== 200) { rec("keys endpoint", false, `unexpected HTTP ${status}`); return finish(); }
  rec("Spell enabled and configured", true);
  const served = (body.keys ?? []).map((k) => k.kid);
  rec("server publishes only public keys", (body.keys ?? []).every((k) => k.d === undefined));
  rec("server serves the pinned key id", pinned.keys.every((k) => served.includes(k.kid)), `served=${served.join(",")} pinned=${pinned.keys.map((k) => k.kid).join(",")}`);
  if (!CODE) { console.log("\n(no LICENSE_CODE: stopping after preflight)"); return finish(); }

  // ── full flow with the real client + pinned key ──────────────────────────
  const clock = { ms: Date.now() };
  let online = true;
  const gated: Transport = async (r) => { if (!online) throw new Error("offline"); return transport(r); };
  const mk = () => new SpellLicenseClient({ store: new MemoryStore<ClientRecord>(), protector, transport: gated, appVersion: "smoke", pinnedJwks: pinned as never, requirePinned: true, now: () => clock.ms });
  const A = mk();
  try {
    const g = await A.activate(CODE);
    rec("activation (token verified against the PINNED key)", ["ACTIVATED", "ALREADY_ACTIVE", "TRANSFERRED"].includes(g.status), g.status);
  } catch (e) {
    rec("activation", false, `${(e as { code?: string }).code}`);
    return finish();
  }
  rec("local state ACTIVE", (await A.state()).kind === "ACTIVE");
  rec("validation", (await A.validate()).kind === "ACTIVE");

  const dict = new MemoryStore<DictionaryDoc>();
  const session = new DesktopSpellSession(createSpellEngineV1(), dict, A);
  const text = "Тэр маш сайнн ажилласан. Зоригтбаатар ирлээ.";
  const r = await session.check(text, { reportUnknown: true });
  const bad = !r.locked ? r.issues.find((i) => i.verdict === "MISSPELLED") : undefined;
  rec("spell check finds the misspelling", !!bad && bad.suggestions[0] === "сайн", bad ? `${bad.token}→${bad.suggestions[0]}` : "none");
  if (bad) rec("replace", session.applyReplacement(text, bad, bad.suggestions[0]!).text.includes("сайн ажилласан"));
  session.addToDictionary("Зоригтбаатар");
  const r2 = await session.check(text, { reportUnknown: true });
  rec("personal dictionary silences the name", !r2.locked && !r2.issues.some((i) => i.token === "Зоригтбаатар"));

  const B = mk();
  const err = await B.activate(CODE).catch((e) => e as { code?: string });
  rec("second computer requires explicit transfer confirmation", (err as { code?: string }).code === "TRANSFER_CONFIRMATION_REQUIRED" || (err as { code?: string }).code === "TRANSFER_COOLDOWN_ACTIVE", String((err as { code?: string }).code));

  online = false;
  rec("offline: still ACTIVE within the token window", (await A.state()).kind === "ACTIVE");
  clock.ms += 25 * 3_600_000;
  rec("offline: VALIDATION_REQUIRED after the 24 h limit", (await A.state()).kind === "VALIDATION_REQUIRED");
  clock.ms -= 25 * 3_600_000;
  online = true;
  await A.deactivate().then(() => rec("deactivation releases the computer", true), (e) => rec("deactivation", false, (e as { code?: string }).code));
  finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
