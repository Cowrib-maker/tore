import path from "node:path";

import type { JSONWebKeySet } from "jose";
import fs from "node:fs";
import { app, BrowserWindow, dialog, ipcMain, safeStorage, session } from "electron";

import { SpellClientError, SpellLicenseClient, type ClientRecord, type Transport } from "../core/license-client";
import { formatUlaanbaatar, messageForCode } from "../core/messages";
import { DesktopSpellSession, StaleIssueError, type DesktopIssue, type DictionaryDoc } from "../core/spell-session";
import { FeedbackLog, type FeedbackDoc, type FeedbackEntry } from "../core/feedback";
import { FileStore, type SecretProtector } from "../core/store";
import { runSelfTest } from "./selftest";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";

/** Baked at build time by build.mjs (see config/environments.json). No secrets. */
declare const __TORE_ENV__: string;
declare const __TORE_API_BASE__: string;
declare const __TORE_PINNED_JWKS__: JSONWebKeySet;

const RELEASE = __TORE_ENV__ !== "development";
// An unpackaged development run may point at a local server (smoke tests).
const API_BASE = RELEASE ? __TORE_API_BASE__ : (!app.isPackaged && process.env.TORE_SPELL_DEV_API_BASE) || __TORE_API_BASE__;

const transport: Transport = async (req) => {
  if (!API_BASE) throw new Error("API origin is not configured");
  const res = await fetch(new URL(req.path, API_BASE), { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(15_000) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const protector: SecretProtector = {
  protect(plain) {
    if (!safeStorage.isEncryptionAvailable()) throw new SpellClientError("SECURE_STORAGE_UNAVAILABLE", messageForCode("SECURE_STORAGE_UNAVAILABLE"));
    return safeStorage.encryptString(plain.toString("base64")).toString("base64");
  },
  unprotect(stored) {
    return Buffer.from(safeStorage.decryptString(Buffer.from(stored, "base64")), "base64");
  },
};

function fail(e: unknown) {
  if (e instanceof SpellClientError) return { ok: false as const, code: e.code, message: e.messageMn, details: e.details };
  if (e instanceof StaleIssueError) return { ok: false as const, code: "STALE_ISSUE", message: "Текст өөрчлөгдсөн тул дахин шалгана уу." };
  console.error("[spell-desktop]", e instanceof Error ? `${e.name}: ${e.message}` : "unknown error");
  return { ok: false as const, code: "INTERNAL", message: "Алдаа гарлаа." };
}

async function start() {
  await app.whenReady();
  const selftest = process.argv.find((a) => a.startsWith("--selftest="));
  if (selftest) {
    await runSelfTest(selftest.slice("--selftest=".length), { name: __TORE_ENV__, apiBase: __TORE_API_BASE__, pinned: __TORE_PINNED_JWKS__, release: RELEASE });
  }
  const dir = app.getPath("userData");
  const client = new SpellLicenseClient({
    store: new FileStore<ClientRecord>(path.join(dir, "license.json")),
    protector,
    transport,
    appVersion: app.getVersion(),
    platform: "WINDOWS",
    pinnedJwks: __TORE_PINNED_JWKS__.keys.length > 0 ? __TORE_PINNED_JWKS__ : undefined,
    requirePinned: RELEASE,
  });
  const spell = new DesktopSpellSession(createSpellEngineV1(), new FileStore<DictionaryDoc>(path.join(dir, "dictionary.json")), client);

  const feedback = new FeedbackLog(new FileStore<FeedbackDoc>(path.join(dir, "feedback.json")));

  const view = async () => {
    const st = await client.state();
    return st.kind === "ACTIVE" ? { ...st, licenseExpiresAtLocal: formatUlaanbaatar(st.licenseExpiresAt), offlineUntilLocal: formatUlaanbaatar(st.offlineUntil) } : st;
  };
  const wrap = <A extends unknown[]>(fn: (...a: A) => Promise<unknown> | unknown) => async (_e: unknown, ...a: A) => {
    try {
      return { ok: true as const, value: await fn(...a) };
    } catch (e) {
      return fail(e);
    }
  };

  ipcMain.handle("license:state", wrap(view));
  ipcMain.handle("license:activate", wrap(async (code: string, confirm?: string) => {
    await client.activate(code, { confirmTransferOfActivationId: confirm });
    return view();
  }));
  ipcMain.handle("license:validate", wrap(async () => (await client.validate(), view())));
  ipcMain.handle("license:deactivate", wrap(async () => (await client.deactivate(), view())));
  ipcMain.handle("spell:check", wrap((text: string, unknown: boolean) => spell.check(String(text).slice(0, 2_000_000), { reportUnknown: !!unknown })));
  ipcMain.handle("spell:replace", wrap((text: string, issue: DesktopIssue, replacement: string) => spell.applyReplacement(text, issue, replacement)));
  ipcMain.handle("spell:ignoreOnce", wrap((issue: DesktopIssue) => spell.ignoreOnce(issue)));
  ipcMain.handle("spell:ignoreAll", wrap((issue: DesktopIssue) => spell.ignoreAll(issue)));
  ipcMain.handle("dict:add", wrap((w: string) => spell.addToDictionary(w)));
  ipcMain.handle("dict:remove", wrap((w: string) => spell.removeFromDictionary(w)));
  ipcMain.handle("feedback:add", wrap((entry: Omit<FeedbackEntry, "at">) => feedback.add(entry).kind));
  ipcMain.handle("feedback:count", wrap(() => feedback.count()));
  // Export is an explicit user action through a save dialog; nothing is ever uploaded.
  ipcMain.handle("feedback:export", wrap(async () => {
    const r = await dialog.showSaveDialog({ title: "Алдаа мэдээллийн файл хадгалах", defaultPath: "tore-spell-feedback.tsv", filters: [{ name: "TSV", extensions: ["tsv"] }] });
    if (r.canceled || !r.filePath) return { saved: false };
    fs.writeFileSync(r.filePath, feedback.exportTsv(), "utf8");
    return { saved: true, count: feedback.count() };
  }));
  ipcMain.handle("dict:words", wrap(() => spell.dictionaryWords()));

  // No remote content, no navigation, no permission grants.
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  const win = new BrowserWindow({
    width: 980,
    height: 720,
    title: RELEASE ? "TORE Spell Бета" : "TORE Spell (dev)",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  await win.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Start-up validation, then at the server-provided cadence (12 h default; checked hourly).
  const tick = async () => {
    if ((await client.state()).kind !== "UNACTIVATED") await client.validate().catch(() => undefined);
    win.webContents.send("license:changed");
  };
  void tick();
  setInterval(() => void client.state().then((s) => (s.kind === "ACTIVE" && s.refreshDue) || s.kind === "VALIDATION_REQUIRED" ? tick() : undefined), 60 * 60 * 1000);
  app.on("window-all-closed", () => app.quit());
}

void start();
