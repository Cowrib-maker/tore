import { createPrivateKey, createPublicKey } from "node:crypto";
import { DEFAULT_QPAY_BASE_URL } from "@/lib/env-schema";
import { parseSpellPrices } from "@/domain/spell/pricing";
import { SpellPlanCode } from "@/domain/spell/enums";
import { getSpellRelease } from "@/domain/spell/update";
import { parseSpellConfig } from "./spell-config";

/**
 * Production-readiness check of a Spell environment. It reads names and shapes only and NEVER returns or prints a value: a result row says
 * OK / MISSING / INVALID / WARN plus a fixed message. Run it against the real production environment (a shell with the variables exported)
 * before enabling TORE_SPELL_V1; with the repository alone it reports everything as MISSING, which is the honest answer.
 */
export type ConfigStatus = "OK" | "MISSING" | "INVALID" | "WARN";
export type ConfigCheck = { id: string; status: ConfigStatus; message: string; blocker: boolean };
type Env = Record<string, string | undefined>;
const has = (e: Env, k: string) => !!e[k]?.trim();
const url = (v: string | undefined) => { try { return v ? new URL(v) : null; } catch { return null; } };
const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function checkSpellProductionConfig(env: Env, opts: { pinnedProductionKeys?: { keys: { kid?: string; x?: string }[] } } = {}): ConfigCheck[] {
  const out: ConfigCheck[] = [];
  const add = (id: string, status: ConfigStatus, message: string, blocker = status === "MISSING" || status === "INVALID") => out.push({ id, status, message, blocker });

  // origin
  const app = url(env.NEXT_PUBLIC_APP_URL);
  if (!app) add("APP_URL", "MISSING", "NEXT_PUBLIC_APP_URL is not set to a valid URL");
  else if (app.protocol !== "https:" || LOCAL.has(app.hostname)) add("APP_URL", "INVALID", "NEXT_PUBLIC_APP_URL must be the public https origin (not http, not localhost)");
  else add("APP_URL", "OK", "public https origin");
  const auth = url(env.AUTH_URL);
  if (!auth) add("AUTH_URL", "MISSING", "AUTH_URL (public origin for Auth.js callbacks) is not set");
  else if (auth.protocol !== "https:" || LOCAL.has(auth.hostname)) add("AUTH_URL", "INVALID", "AUTH_URL must be https and not localhost");
  else add("AUTH_URL", app && auth.origin !== app.origin ? "WARN" : "OK", app && auth.origin !== app.origin ? "AUTH_URL differs from NEXT_PUBLIC_APP_URL" : "https origin", false);
  if (!has(env, "AUTH_SECRET")) add("AUTH_SECRET", "MISSING", "AUTH_SECRET is not set");
  else add("AUTH_SECRET", (env.AUTH_SECRET ?? "").length >= 32 ? "OK" : "INVALID", (env.AUTH_SECRET ?? "").length >= 32 ? "set (value not shown)" : "AUTH_SECRET is shorter than 32 characters");

  // database
  const db = url(env.DATABASE_URL);
  if (!db) add("DATABASE_URL", "MISSING", "DATABASE_URL is not set");
  else if (LOCAL.has(db.hostname)) add("DATABASE_URL", "INVALID", "DATABASE_URL points to a local database; production must not");
  else add("DATABASE_URL", "OK", "remote database configured (host not shown)");
  add("MIGRATIONS", "WARN", "cannot be checked from the environment: run `prisma migrate status` against production and confirm 20261005120000, 20261006120000 and 20261008120000 are applied", false);

  // feature flag + Spell secrets
  add("FEATURE_FLAG", env.TORE_SPELL_V1 === "1" ? "OK" : "MISSING", env.TORE_SPELL_V1 === "1" ? "TORE_SPELL_V1=1" : "TORE_SPELL_V1 is not 1 (Spell is OFF; correct until everything else is ready)");
  try {
    const cfg = parseSpellConfig(env);
    add("SPELL_KEYS", "OK", `code HMAC/encryption and signing key rings valid (signing kid ${cfg.signing.activeKid})`);
    const pinned = opts.pinnedProductionKeys?.keys.find((k) => k.kid === cfg.signing.activeKid);
    if (!pinned) add("PINNED_KEY", "INVALID", `desktop/config/pinned-keys.production.json has no key with kid ${cfg.signing.activeKid}: installed apps would reject every licence token`);
    else {
      const jwk = createPublicKey(createPrivateKey({ key: cfg.signing.keys.get(cfg.signing.activeKid)!, format: "der", type: "pkcs8" })).export({ format: "jwk" }) as { x?: string };
      add("PINNED_KEY", jwk.x === pinned.x ? "OK" : "INVALID", jwk.x === pinned.x ? "the pinned PUBLIC key in the desktop build matches the server's active signing key" : "the pinned PUBLIC key differs from the server's signing key: installed apps would reject every licence token");
    }
  } catch (e) {
    add("SPELL_KEYS", "MISSING", `Spell key configuration invalid: ${(e as { problems?: string[] }).problems?.map((p) => p.replace(/:.*/, "")).join("; ") ?? "see parseSpellConfig"}`);
  }

  // prices
  const prices = parseSpellPrices(env.SPELL_PRICES_MNT);
  const unpriced = Object.values(SpellPlanCode).filter((p) => prices[p] === undefined);
  add("PRICES", unpriced.length === 0 ? "OK" : "MISSING", unpriced.length === 0 ? "all four plans have a server-side price" : `no valid price for: ${unpriced.join(", ")}`);

  // QPay
  const qpayMissing = ["QPAY_CLIENT_ID", "QPAY_CLIENT_SECRET", "QPAY_INVOICE_CODE", "QPAY_CALLBACK_URL"].filter((k) => !has(env, k));
  if (qpayMissing.length) add("QPAY", "MISSING", `QPay not configured: ${qpayMissing.join(", ")}`);
  else {
    const cb = url(env.QPAY_CALLBACK_URL);
    const base = env.QPAY_BASE_URL?.trim() || DEFAULT_QPAY_BASE_URL;
    if (!cb || cb.protocol !== "https:" || LOCAL.has(cb.hostname)) add("QPAY_CALLBACK", "INVALID", "QPAY_CALLBACK_URL must be a public https URL");
    else if (app && cb.origin !== app.origin) add("QPAY_CALLBACK", "INVALID", "QPAY_CALLBACK_URL is not on the public origin");
    else if (cb.pathname !== "/api/billing/qpay/callback") add("QPAY_CALLBACK", "INVALID", "QPAY_CALLBACK_URL path must be /api/billing/qpay/callback");
    else add("QPAY_CALLBACK", "OK", "public https callback on the app origin");
    add("QPAY_BASE", /sandbox/i.test(base) ? "WARN" : "OK", /sandbox/i.test(base) ? "QPAY_BASE_URL is the QPay SANDBOX: no real payment can happen" : "non-sandbox QPay base URL", /sandbox/i.test(base));
  }

  // installer + release
  const rel = getSpellRelease(env);
  add("INSTALLER_URL", rel ? "OK" : "MISSING", rel ? "https installer URL, SHA-256 and version are configured (the file itself must be fetched and hashed separately)" : "SPELL_WINDOWS_INSTALLER_URL / SPELL_WINDOWS_INSTALLER_SHA256 / SPELL_RELEASE_VERSION are not all set and valid: the download stays hidden and no update notice is published");

  // signing + MVP escape hatches
  add("CODE_SIGNING", has(env, "CSC_LINK") && has(env, "CSC_KEY_PASSWORD") ? "OK" : "MISSING", has(env, "CSC_LINK") && has(env, "CSC_KEY_PASSWORD") ? "signing certificate secrets are present in this environment (the real result is the Authenticode status of the built installer)" : "REQUIRES PRODUCTION SIGNING CERTIFICATE: CSC_LINK / CSC_KEY_PASSWORD (CI secrets) not present; the installer is unsigned");
  const hatches = Object.keys(env).filter((k) => /^TORE_ALLOW_/.test(k) && env[k] === "1");
  add("ESCAPE_HATCHES", hatches.length ? "WARN" : "OK", hatches.length ? `MVP escape-hatch flags set: ${hatches.join(", ")} (each weakens a production guard; review each)` : "no TORE_ALLOW_* flags set", false);
  return out;
}

export const hasBlockers = (checks: ConfigCheck[]) => checks.some((c) => c.blocker);
