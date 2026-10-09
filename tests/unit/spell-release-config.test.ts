import { createPrivateKey, createPublicKey } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { checkSpellProductionConfig, hasBlockers } from "@/infrastructure/spell/release-config";
import { makeSpellEnv } from "./helpers/spell-kit";

const SECRET_MARKERS = ["very-secret-qpay-value", "very-secret-auth-value-0123456789abcdef0123456789", "very-secret-db-password"];

function goodEnv() {
  const e = makeSpellEnv();
  const x = (createPublicKey(createPrivateKey({ key: Buffer.from(e.SPELL_SIGNING_KEYS!.split(":")[1]!, "base64"), format: "der", type: "pkcs8" })).export({ format: "jwk" }) as { x: string }).x;
  const env: Record<string, string> = {
    ...e,
    NEXT_PUBLIC_APP_URL: "https://spell.example.org", AUTH_URL: "https://spell.example.org", AUTH_SECRET: SECRET_MARKERS[1]!,
    DATABASE_URL: `postgresql://u:${SECRET_MARKERS[2]}@db.example.org:5432/tore`,
    TORE_SPELL_V1: "1", SPELL_PRICES_MNT: JSON.stringify({ SPELL_1M: 1, SPELL_3M: 2, SPELL_6M: 3, SPELL_12M: 4 }),
    QPAY_BASE_URL: "https://merchant.example.org", QPAY_CLIENT_ID: "id", QPAY_CLIENT_SECRET: SECRET_MARKERS[0]!, QPAY_INVOICE_CODE: "CODE", QPAY_CALLBACK_URL: "https://spell.example.org/api/billing/qpay/callback",
    SPELL_WINDOWS_INSTALLER_URL: "https://downloads.example.org/TORE-Spell-Setup.exe", SPELL_WINDOWS_INSTALLER_SHA256: "a".repeat(64), SPELL_RELEASE_VERSION: "1.0.0",
    CSC_LINK: "x", CSC_KEY_PASSWORD: "y",
  };
  return { env, pinned: { keys: [{ kid: "k1", x }] } };
}
const status = (checks: ReturnType<typeof checkSpellProductionConfig>, id: string) => checks.find((c) => c.id === id)!.status;

describe("production configuration check", () => {
  it("an empty environment has every blocker (the repository alone configures nothing)", () => {
    const c = checkSpellProductionConfig({});
    expect(hasBlockers(c)).toBe(true);
    for (const id of ["APP_URL", "DATABASE_URL", "FEATURE_FLAG", "SPELL_KEYS", "PRICES", "QPAY", "INSTALLER_URL", "CODE_SIGNING"]) expect(status(c, id), id).toBe("MISSING");
  });
  it("a complete https environment has no blockers", () => {
    const { env, pinned } = goodEnv();
    const c = checkSpellProductionConfig(env, { pinnedProductionKeys: pinned });
    expect(c.filter((x) => x.blocker)).toEqual([]);
    expect(status(c, "PINNED_KEY")).toBe("OK");
  });
  it("never reveals a secret value in any message", () => {
    const { env, pinned } = goodEnv();
    const text = JSON.stringify([checkSpellProductionConfig(env, { pinnedProductionKeys: pinned }), checkSpellProductionConfig({ ...env, DATABASE_URL: "postgresql://u:very-secret-db-password@localhost/x" }, { pinnedProductionKeys: pinned })]);
    for (const s of SECRET_MARKERS) expect(text).not.toContain(s);
    expect(text).not.toContain(env.SPELL_SIGNING_KEYS!.split(":")[1]!);
  });
  it("localhost / http origins, a local database and a localhost QPay callback are blockers", () => {
    const { env, pinned } = goodEnv();
    const c = checkSpellProductionConfig({ ...env, NEXT_PUBLIC_APP_URL: "http://localhost:3000", DATABASE_URL: "postgresql://u:p@127.0.0.1/x", QPAY_CALLBACK_URL: "http://localhost:3000/api/billing/qpay/callback" }, { pinnedProductionKeys: pinned });
    expect(status(c, "APP_URL")).toBe("INVALID");
    expect(status(c, "DATABASE_URL")).toBe("INVALID");
    expect(status(c, "QPAY_CALLBACK")).toBe("INVALID");
  });
  it("a QPay callback off the app origin or on the wrong path is refused; the sandbox base URL is a blocker (no real money)", () => {
    const { env, pinned } = goodEnv();
    expect(status(checkSpellProductionConfig({ ...env, QPAY_CALLBACK_URL: "https://other.example.org/api/billing/qpay/callback" }, { pinnedProductionKeys: pinned }), "QPAY_CALLBACK")).toBe("INVALID");
    expect(status(checkSpellProductionConfig({ ...env, QPAY_CALLBACK_URL: "https://spell.example.org/cb" }, { pinnedProductionKeys: pinned }), "QPAY_CALLBACK")).toBe("INVALID");
    const sb = checkSpellProductionConfig({ ...env, QPAY_BASE_URL: undefined }, { pinnedProductionKeys: pinned }).find((x) => x.id === "QPAY_BASE")!;
    expect(sb).toMatchObject({ status: "WARN", blocker: true });
  });
  it("a desktop build pinned to a different key than the server's is a blocker (installed apps would reject every licence)", () => {
    const { env } = goodEnv();
    expect(status(checkSpellProductionConfig(env, { pinnedProductionKeys: { keys: [{ kid: "k1", x: "AAAA" }] } }), "PINNED_KEY")).toBe("INVALID");
    expect(status(checkSpellProductionConfig(env, { pinnedProductionKeys: { keys: [{ kid: "other", x: "AAAA" }] } }), "PINNED_KEY")).toBe("INVALID");
  });
  it("missing price for any plan, missing installer pieces and missing signing secrets are blockers; escape hatches only warn", () => {
    const { env, pinned } = goodEnv();
    expect(status(checkSpellProductionConfig({ ...env, SPELL_PRICES_MNT: JSON.stringify({ SPELL_1M: 1 }) }, { pinnedProductionKeys: pinned }), "PRICES")).toBe("MISSING");
    expect(status(checkSpellProductionConfig({ ...env, SPELL_WINDOWS_INSTALLER_SHA256: "" }, { pinnedProductionKeys: pinned }), "INSTALLER_URL")).toBe("MISSING");
    expect(status(checkSpellProductionConfig({ ...env, CSC_LINK: "" }, { pinnedProductionKeys: pinned }), "CODE_SIGNING")).toBe("MISSING");
    const w = checkSpellProductionConfig({ ...env, TORE_ALLOW_NO_REDIS: "1" }, { pinnedProductionKeys: pinned }).find((x) => x.id === "ESCAPE_HATCHES")!;
    expect(w).toMatchObject({ status: "WARN", blocker: false });
  });
  it("the committed desktop pin is PUBLIC material only", () => {
    const p = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../desktop/config/pinned-keys.production.json"), "utf8")) as { keys: Record<string, string>[] };
    expect(p.keys.length).toBeGreaterThan(0);
    for (const k of p.keys) {
      expect(k.d).toBeUndefined();
      expect(k.kty).toBe("OKP");
      expect(k.crv).toBe("Ed25519");
    }
  });
});
