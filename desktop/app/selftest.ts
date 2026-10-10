import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { generateKeyPairSync } from "node:crypto";

import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import { createLocalJWKSet, jwtVerify, SignJWT, type JSONWebKeySet } from "jose";

import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { SpellClientError, SpellLicenseClient, type ClientRecord } from "../core/license-client";
import { DesktopSpellSession, type DictionaryDoc } from "../core/spell-session";
import { FileStore, MemoryStore } from "../core/store";

/**
 * `--selftest=<out.json>`: a no-network, no-license check run by CI against
 * the INSTALLED app on Windows (and on Linux under Xvfb). It proves the
 * packaged bundle starts, the engine runs, the personal dictionary round-trips
 * through the disk, OS secret storage works, and the Mongolian UI renders.
 * It deliberately does NOT claim to test activation (needs a live server).
 */
export async function runSelfTest(outFile: string, env: { name: string; apiBase: string; pinned: JSONWebKeySet; release: boolean }): Promise<never> {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tore-spell-selftest-"));
  try {
    const kids = env.pinned.keys.map((k) => k.kid ?? "");
    check("environment", env.name !== "" && (!env.release || /^https:\/\//.test(env.apiBase)), `${env.name} api=${env.apiBase || "-"} pinned=${kids.join(",") || "-"}`);
    check("pinned-key-loads", !env.release || (kids.length > 0 && env.pinned.keys.every((k) => k.kty === "OKP" && (k as { d?: string }).d === undefined)), `${kids.length} public key(s), no private material`);

    // Crypto stack inside the packaged app: sign/verify/tamper, and the pinned set must refuse a foreign key.
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const jwk = { ...publicKey.export({ format: "jwk" }), kid: "selftest", alg: "EdDSA", use: "sig" } as unknown as JSONWebKeySet["keys"][number];
    const tok = await new SignJWT({ x: 1 }).setProtectedHeader({ alg: "EdDSA", kid: "selftest" }).setIssuedAt().setExpirationTime("1m").sign(privateKey);
    const ok1 = await jwtVerify(tok, createLocalJWKSet({ keys: [jwk] }), { algorithms: ["EdDSA"] }).then(() => true, () => false);
    const tampered = `${tok.split(".")[0]}.${Buffer.from('{"x":2}').toString("base64url")}.${tok.split(".")[2]}`;
    const bad = await jwtVerify(tampered, createLocalJWKSet({ keys: [jwk] }), { algorithms: ["EdDSA"] }).then(() => false, () => true);
    const foreign = env.pinned.keys.length === 0 ? true : await jwtVerify(tok, createLocalJWKSet(env.pinned), { algorithms: ["EdDSA"] }).then(() => false, () => true);
    check("crypto-verify", ok1 && bad && foreign, `valid=${ok1} tamperRejected=${bad} foreignKeyRejectedByPinnedSet=${foreign}`);

    // License client: release config must construct; a client without pinned keys must refuse.
    let refused = false;
    try { new SpellLicenseClient({ store: new MemoryStore<ClientRecord>(), protector: { protect: (b) => b.toString("base64"), unprotect: (x) => Buffer.from(x, "base64") }, transport: async () => ({ status: 0, json: {} }), appVersion: "selftest", requirePinned: true }); } catch (e) { refused = e instanceof SpellClientError && e.code === "PINNED_KEYS_MISSING"; }
    const initOk = (() => { try { new SpellLicenseClient({ store: new MemoryStore<ClientRecord>(), protector: { protect: (b) => b.toString("base64"), unprotect: (x) => Buffer.from(x, "base64") }, transport: async () => ({ status: 0, json: {} }), appVersion: "selftest", pinnedJwks: env.pinned.keys.length ? env.pinned : undefined, requirePinned: env.release }); return true; } catch { return false; } })();
    check("license-client-initializes", refused && initOk, `refusesWithoutPinnedKeys=${refused} releaseConfigConstructs=${initOk}`);

    const sealed = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(safeStorage.encryptString("selftest")) === "selftest" : false;
    check("os-secret-storage", sealed, sealed ? "safeStorage round-trip" : "safeStorage unavailable (expected on headless Linux; DPAPI on Windows)");

    const dict = new FileStore<DictionaryDoc>(path.join(tmp, "dictionary.json"));
    const session = new DesktopSpellSession(createSpellEngineV1(), dict, { isEntitled: async () => true });
    const first = await session.check("Монгол улсын хууль тогтоомж. Зоригтбаатар ажиллав.", { reportUnknown: true });
    check("engine-runs", !first.locked && first.stats.words > 0, first.locked ? "locked" : `${first.stats.words} words`);
    const flagged = !first.locked && first.issues.some((i) => i.token === "Зоригтбаатар");
    session.addToDictionary("Зоригтбаатар");
    const reloaded = new DesktopSpellSession(createSpellEngineV1(), new FileStore<DictionaryDoc>(path.join(tmp, "dictionary.json")), { isEntitled: async () => true });
    const after = await reloaded.check("Зоригтбаатар", { reportUnknown: true });
    check("personal-dictionary-persists", !after.locked && after.issues.length === 0, `flaggedBefore=${flagged}`);
    reloaded.removeFromDictionary("Зоригтбаатар");
    const removed = await reloaded.check("Зоригтбаатар", { reportUnknown: true });
    check("personal-dictionary-remove", !removed.locked && removed.issues.length >= 0 && reloaded.dictionaryWords().length === 0);

    // The renderer asks for license state on load; answer as a fresh install would.
    ipcMain.handle("license:state", () => ({ ok: true, value: { kind: "UNACTIVATED" } }));
    const win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true } });
    await win.loadFile(path.join(__dirname, "renderer", "index.html"));
    await new Promise((r) => setTimeout(r, 800));
    const ui = (await win.webContents.executeJavaScript(
      `({ badge: document.getElementById("lic-badge")?.textContent, lockVisible: !document.getElementById("lock")?.hidden, hasApi: typeof window.spell === "object", title: document.title })`,
    )) as { badge: string; lockVisible: boolean; hasApi: boolean; title: string };
    check("ui-loads-mongolian", ui.hasApi && ui.lockVisible && /[Ѐ-ӿ]/u.test(ui.badge ?? ""), JSON.stringify(ui));
  } catch (e) {
    check("exception", false, e instanceof Error ? `${e.name}: ${e.message}` : "unknown");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // Headless Linux has no keyring; that single check is informational there.
  const failed = checks.filter((c) => !c.ok && !(c.name === "os-secret-storage" && process.platform !== "win32"));
  fs.writeFileSync(outFile, JSON.stringify({ ok: failed.length === 0, platform: process.platform, version: app.getVersion(), checks }, null, 2));
  app.exit(failed.length === 0 ? 0 : 1);
  throw new Error("unreachable");
}
