import { describe, expect, it } from "vitest";

import {
  assertPrismaInvocationIsSafe,
  classifyDatabaseUrl,
  isLocalDatabaseUrl,
  isMutatingPrismaInvocation,
  isProductionMigrationExplicitlyAuthorized,
  PRODUCTION_MIGRATION_OVERRIDE_ENV_VAR,
  UnsafePrismaInvocationError,
} from "../../scripts/lib/database-url-safety";

/**
 * Sprint 14 incident regression coverage. `npx prisma migrate deploy` ran
 * against production Neon because `prisma.config.ts` resolved DATABASE_URL
 * from `.env` (which held a production credential) instead of the intended
 * local `.env.local`. These tests exercise only pure URL/argv classification
 * — no real database, local or remote, is ever contacted here.
 */

describe("classifyDatabaseUrl", () => {
  it("accepts 127.0.0.1 as local", () => {
    expect(
      classifyDatabaseUrl("postgresql://postgres:pw@127.0.0.1:5432/tore_verification"),
    ).toEqual({ kind: "local", hostname: "127.0.0.1" });
  });

  it("accepts localhost as local", () => {
    expect(
      classifyDatabaseUrl("postgresql://postgres:pw@localhost:5432/tore_verification"),
    ).toEqual({ kind: "local", hostname: "localhost" });
  });

  it("accepts ::1 as local", () => {
    // Node's URL parser keeps the brackets in `.hostname` for IPv6 literals.
    expect(
      classifyDatabaseUrl("postgresql://postgres:pw@[::1]:5432/tore_verification"),
    ).toEqual({ kind: "local", hostname: "[::1]" });
  });

  it("rejects a Neon hostname as remote", () => {
    const result = classifyDatabaseUrl(
      "postgresql://neondb_owner:pw@ep-morning-recipe-azj1asek.c-3.ap-southeast-1.aws.neon.tech/neondb",
    );
    expect(result.kind).toBe("remote");
    if (result.kind === "remote") {
      expect(result.hostname).toBe(
        "ep-morning-recipe-azj1asek.c-3.ap-southeast-1.aws.neon.tech",
      );
    }
  });

  it("rejects an arbitrary remote hostname", () => {
    const result = classifyDatabaseUrl(
      "postgresql://user:pw@db.some-other-host.example.com:5432/app",
    );
    expect(result.kind).toBe("remote");
  });

  it("rejects a production-looking hostname", () => {
    const result = classifyDatabaseUrl(
      "postgresql://prod_user:pw@prod-db.internal.tore.mn:5432/tore_production",
    );
    expect(result.kind).toBe("remote");
  });

  it("treats a missing DATABASE_URL as missing, not local", () => {
    expect(classifyDatabaseUrl(undefined)).toEqual({ kind: "missing" });
    expect(classifyDatabaseUrl(null)).toEqual({ kind: "missing" });
    expect(classifyDatabaseUrl("")).toEqual({ kind: "missing" });
    expect(classifyDatabaseUrl("   ")).toEqual({ kind: "missing" });
  });

  it("treats an unparseable DATABASE_URL as malformed, not local", () => {
    expect(classifyDatabaseUrl("not a url at all")).toEqual({ kind: "malformed" });
    expect(classifyDatabaseUrl("postgresql://:::::")).toEqual({ kind: "malformed" });
  });

  it("never echoes the raw connection string for a malformed value", () => {
    const result = classifyDatabaseUrl("://user:supersecretpassword@host/db");
    expect(JSON.stringify(result)).not.toContain("supersecretpassword");
  });
});

describe("isLocalDatabaseUrl", () => {
  it("is a thin true/false wrapper over classifyDatabaseUrl", () => {
    expect(isLocalDatabaseUrl("postgresql://postgres@127.0.0.1:5432/tore_verification")).toBe(
      true,
    );
    expect(isLocalDatabaseUrl("postgresql://user@neon.tech/db")).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
  });
});

describe("isMutatingPrismaInvocation", () => {
  it.each([
    ["migrate", "deploy"],
    ["migrate", "dev"],
    ["migrate", "reset"],
    ["migrate", "resolve"],
    ["db", "push"],
    ["db", "execute"],
    ["db", "seed"],
  ])("treats `prisma %s %s` as mutating", (a, b) => {
    expect(isMutatingPrismaInvocation([a, b])).toBe(true);
  });

  it.each([
    ["generate"],
    ["validate"],
    ["format"],
    ["version"],
    ["studio"],
  ])("does not treat `prisma %s` as mutating", (a) => {
    expect(isMutatingPrismaInvocation([a])).toBe(false);
  });

  it("does not treat `prisma migrate status` (read-only) as mutating", () => {
    expect(isMutatingPrismaInvocation(["migrate", "status"])).toBe(false);
  });

  it("ignores leading flags when identifying the subcommand", () => {
    expect(isMutatingPrismaInvocation(["--schema", "prisma/schema.prisma", "migrate", "deploy"])).toBe(
      true,
    );
  });
});

describe("isProductionMigrationExplicitlyAuthorized", () => {
  it("is false when the override env var is unset", () => {
    expect(isProductionMigrationExplicitlyAuthorized({})).toBe(false);
  });

  it("is false for a plausible-but-wrong value (guards against accidental truthy values)", () => {
    expect(
      isProductionMigrationExplicitlyAuthorized({
        [PRODUCTION_MIGRATION_OVERRIDE_ENV_VAR]: "1",
      }),
    ).toBe(false);
    expect(
      isProductionMigrationExplicitlyAuthorized({
        [PRODUCTION_MIGRATION_OVERRIDE_ENV_VAR]: "true",
      }),
    ).toBe(false);
  });

  it("is true only for the exact documented value", () => {
    expect(
      isProductionMigrationExplicitlyAuthorized({
        [PRODUCTION_MIGRATION_OVERRIDE_ENV_VAR]: "YES_TARGET_PRODUCTION_DELIBERATELY",
      }),
    ).toBe(true);
  });
});

describe("assertPrismaInvocationIsSafe — the fail-closed guard", () => {
  it("allows a mutating command against 127.0.0.1", () => {
    expect(() =>
      assertPrismaInvocationIsSafe({
        argv: ["migrate", "deploy"],
        databaseUrl: "postgresql://postgres@127.0.0.1:5432/tore_verification",
        env: {},
      }),
    ).not.toThrow();
  });

  it("allows a mutating command against localhost", () => {
    expect(() =>
      assertPrismaInvocationIsSafe({
        argv: ["db", "push"],
        databaseUrl: "postgresql://postgres@localhost:5432/tore_verification",
        env: {},
      }),
    ).not.toThrow();
  });

  it("blocks a mutating command against a Neon hostname (the exact incident scenario)", () => {
    expect(() =>
      assertPrismaInvocationIsSafe({
        argv: ["migrate", "deploy"],
        databaseUrl:
          "postgresql://neondb_owner@ep-morning-recipe-azj1asek.c-3.ap-southeast-1.aws.neon.tech/neondb",
        env: {},
      }),
    ).toThrow(UnsafePrismaInvocationError);
  });

  it("blocks a mutating command when DATABASE_URL is missing", () => {
    expect(() =>
      assertPrismaInvocationIsSafe({
        argv: ["migrate", "dev"],
        databaseUrl: undefined,
        env: {},
      }),
    ).toThrow(UnsafePrismaInvocationError);
  });

  it("blocks a mutating command when DATABASE_URL is malformed", () => {
    expect(() =>
      assertPrismaInvocationIsSafe({
        argv: ["db", "seed"],
        databaseUrl: "not-a-valid-url",
        env: {},
      }),
    ).toThrow(UnsafePrismaInvocationError);
  });

  it("blocks db seed / db execute / migrate reset against a remote host", () => {
    for (const argv of [["db", "seed"], ["db", "execute"], ["migrate", "reset"]]) {
      expect(() =>
        assertPrismaInvocationIsSafe({
          argv,
          databaseUrl: "postgresql://user@remote-host.example.com:5432/db",
          env: {},
        }),
      ).toThrow(UnsafePrismaInvocationError);
    }
  });

  it("never throws for non-mutating commands, even against a remote host", () => {
    for (const argv of [["generate"], ["validate"], ["migrate", "status"], ["studio"]]) {
      expect(() =>
        assertPrismaInvocationIsSafe({
          argv,
          databaseUrl: "postgresql://user@remote-host.example.com:5432/db",
          env: {},
        }),
      ).not.toThrow();
    }
  });

  it("allows a mutating command against a remote host only with the exact explicit authorization value", () => {
    expect(() =>
      assertPrismaInvocationIsSafe({
        argv: ["migrate", "deploy"],
        databaseUrl: "postgresql://user@remote-host.example.com:5432/db",
        env: { [PRODUCTION_MIGRATION_OVERRIDE_ENV_VAR]: "YES_TARGET_PRODUCTION_DELIBERATELY" },
      }),
    ).not.toThrow();
  });

  it("does not treat a merely truthy override value as authorization", () => {
    expect(() =>
      assertPrismaInvocationIsSafe({
        argv: ["migrate", "deploy"],
        databaseUrl: "postgresql://user@remote-host.example.com:5432/db",
        env: { [PRODUCTION_MIGRATION_OVERRIDE_ENV_VAR]: "1" },
      }),
    ).toThrow(UnsafePrismaInvocationError);
  });

  it("error message never contains the connection string or credentials", () => {
    try {
      assertPrismaInvocationIsSafe({
        argv: ["migrate", "deploy"],
        databaseUrl: "postgresql://neondb_owner:supersecretpassword@ep-x.neon.tech/neondb",
        env: {},
      });
      expect.unreachable("expected assertPrismaInvocationIsSafe to throw");
    } catch (error) {
      expect(String(error)).not.toContain("supersecretpassword");
      expect(String(error)).not.toContain("neondb_owner:");
    }
  });
});
