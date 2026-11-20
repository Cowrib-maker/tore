import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(__dirname, "../../prisma/migrations");
const dir = readdirSync(MIGRATIONS).find((d) => d.endsWith("_spell_licensing_foundation"))!;
const sql = readFileSync(path.join(MIGRATIONS, dir, "migration.sql"), "utf8");
// Strip comments so prose in headers/rollback notes is not mistaken for DDL.
const ddl = sql.replace(/--.*$/gm, "");
const statements = ddl.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);

describe("spell licensing migration safety", () => {
  it("is purely additive: no DROP/TRUNCATE/DELETE/UPDATE/RENAME and no data changes", () => {
    for (const forbidden of [/\bDROP\s+(?!TRIGGER\b)/i, /\bTRUNCATE\s+TABLE\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+\S+\s+SET\b/i, /\bRENAME\b/i, /\bINSERT\s+INTO\b/i]) {
      expect(ddl).not.toMatch(forbidden);
    }
  });

  it("alters only new spell_* tables (the single link to users is a FK on a new table)", () => {
    for (const stmt of statements.filter((s) => /^ALTER TABLE/i.test(s))) {
      expect(stmt).toMatch(/^ALTER TABLE "spell_/i);
    }
    for (const stmt of statements.filter((s) => /^CREATE (UNIQUE )?INDEX/i.test(s))) {
      expect(stmt).toMatch(/ON "spell_/i);
    }
    expect(ddl).not.toMatch(/ALTER TABLE "users"/i);
  });

  it("creates the database-level one-ACTIVE-activation-per-license backstop", () => {
    expect(ddl).toMatch(
      /CREATE UNIQUE INDEX "spell_activations_one_active_per_license"\s+ON "spell_activations"\("license_id"\)\s+WHERE "status" = 'ACTIVE'/,
    );
  });

  it("makes the event log append-only (UPDATE/DELETE/TRUNCATE rejected)", () => {
    expect(ddl).toMatch(/BEFORE UPDATE OR DELETE ON "spell_license_events"/);
    expect(ddl).toMatch(/BEFORE TRUNCATE ON "spell_license_events"/);
    expect(ddl).toMatch(/RAISE EXCEPTION/);
  });

  it("enforces state invariants with CHECK constraints", () => {
    for (const name of ["spell_licenses_term_pair_chk", "spell_licenses_term_order_chk", "spell_licenses_revoked_chk", "spell_activations_end_state_chk"]) {
      expect(ddl).toContain(name);
    }
  });

  it("does not store a plaintext code column and keeps the key version beside the ciphertext", () => {
    expect(ddl).not.toMatch(/"(license_)?code"\s+TEXT/i);
    expect(ddl).toContain('"code_hash" TEXT NOT NULL');
    expect(ddl).toContain('"code_ciphertext" BYTEA NOT NULL');
    expect(ddl).toContain('"code_enc_key_version" TEXT NOT NULL');
    expect(ddl).toContain('"code_hint" TEXT NOT NULL');
  });

  it("sorts after every non-Spell migration (no ordering conflict); only later Spell migrations follow it", () => {
    const all = readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d)).sort();
    const after = all.slice(all.indexOf(dir) + 1);
    expect(all).toContain(dir);
    expect(after.every((d) => /_spell_/.test(d))).toBe(true);
  });
});
