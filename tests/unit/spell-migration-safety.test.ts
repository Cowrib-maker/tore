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

  // Migration-ordering policy. What actually matters is not that Spell migrations are the LAST migrations (that would reject every
  // future non-Spell migration), but that Spell migrations (a) are additive, (b) only touch spell_* objects apart from one reviewed
  // additive column, (c) only depend on tables created by an EARLIER migration, and (d) are never altered by a later non-Spell migration.
  const allMigrations = readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d)).sort();
  const isSpell = (d: string) => /_spell_/.test(d);
  const ddlOf = (d: string) => readFileSync(path.join(MIGRATIONS, d, "migration.sql"), "utf8").replace(/--.*$/gm, "");
  const stmtsOf = (d: string) => ddlOf(d).split(/;\s*(?:\r?\n|$)/).map((x) => x.trim()).filter(Boolean);
  const spellMigrations = allMigrations.filter(isSpell);
  const FORBIDDEN = [/\bDROP\s+(?!TRIGGER\b)/i, /\bTRUNCATE\s+TABLE\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+\S+\s+SET\b/i, /\bRENAME\b/i, /\bINSERT\s+INTO\b/i];
  // The only statement a Spell migration may run against a non-spell_ table: a nullable, additive column on invoices (purchase flow).
  const ALLOWED_NON_SPELL_ALTER = /^ALTER TABLE "invoices" ADD COLUMN "spell_plan_code" "SpellPlanCode"$/i;

  it("the Spell migration set exists and starts at the licensing foundation", () => {
    expect(spellMigrations.length).toBeGreaterThanOrEqual(1);
    expect(allMigrations).toContain(dir);
    expect(spellMigrations[0]).toBe(dir);
  });

  it("every Spell migration is purely additive", () => {
    for (const d of spellMigrations) {
      for (const forbidden of FORBIDDEN) expect(ddlOf(d), d).not.toMatch(forbidden);
    }
  });

  it("every Spell migration alters only spell_* tables (plus the single reviewed additive invoices column)", () => {
    for (const d of spellMigrations) {
      for (const stmt of stmtsOf(d).filter((x) => /^ALTER TABLE/i.test(x))) {
        const ok = /^ALTER TABLE "spell_/i.test(stmt) || ALLOWED_NON_SPELL_ALTER.test(stmt.replace(/\s+/g, " "));
        expect(ok, `${d}: ${stmt.slice(0, 80)}`).toBe(true);
      }
      for (const stmt of stmtsOf(d).filter((x) => /^CREATE (UNIQUE )?INDEX/i.test(x))) expect(stmt, d).toMatch(/ON "spell_/i);
    }
  });

  it("every table a Spell migration references or alters outside spell_* is created by a strictly EARLIER migration", () => {
    for (const d of spellMigrations) {
      const deps = new Set<string>();
      for (const m of ddlOf(d).matchAll(/REFERENCES\s+"([^"]+)"/gi)) deps.add(m[1]);
      for (const m of ddlOf(d).matchAll(/ALTER TABLE\s+"([^"]+)"/gi)) deps.add(m[1]);
      for (const table of [...deps].filter((t) => !t.startsWith("spell_"))) {
        const creators = allMigrations.filter((x) => new RegExp(`CREATE TABLE "${table}"`, "i").test(ddlOf(x)));
        expect(creators.length, `${d} depends on "${table}" but no migration creates it`).toBeGreaterThan(0);
        expect(creators[0] < d, `${d}: "${table}" must be created by an earlier migration (found ${creators[0]})`).toBe(true);
      }
    }
  });

  it("later non-Spell migrations are allowed, but never touch Spell objects", () => {
    for (const d of allMigrations.filter((x) => !isSpell(x) && x > dir)) {
      expect(ddlOf(d), d).not.toMatch(/"spell_[a-z_]*"|"Spell[A-Za-z]+"/);
    }
  });
});
