import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InvoiceStatus } from "@/domain/enums";
import { PrismaClient } from "@/generated/prisma/client";
import { spellColumnsOmit } from "@/infrastructure/database/spell-schema-gate";
import { PrismaInvoiceRepository } from "@/infrastructure/repositories/prisma-invoice-repository";

/**
 * Real Postgres + the real Prisma/pg stack. Deploy-order safety: with Spell disabled, no query may name `invoices.spell_plan_code`, because
 * the production database may not have the Spell migrations yet (the build does not run migrations). The SQL actually sent is captured, so this
 * holds whatever the schema state of the test database is.
 */
function makeClient(spellEnabled: boolean, sql: string[]) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: [{ emit: "event", level: "query" }],
    omit: spellColumnsOmit(spellEnabled),
  });
  (client as unknown as { $on: (e: "query", cb: (q: { query: string }) => void) => void }).$on("query", (q) => sql.push(q.query));
  return { client, pool };
}

describe("Spell columns are left out of invoice queries until Spell is enabled", () => {
  const sqlOff: string[] = [];
  const sqlOn: string[] = [];
  const off = makeClient(false, sqlOff);
  const on = makeClient(true, sqlOn);
  const userId = randomUUID();

  beforeAll(async () => {
    await off.client.user.create({ data: { id: userId, email: `${userId}@gate.test`, name: "gate", role: "CLIENT" as never } as never });
  });
  afterAll(async () => {
    await off.client.invoice.deleteMany({ where: { userId } });
    await off.client.user.delete({ where: { id: userId } });
    await off.client.$disconnect();
    await on.client.$disconnect();
    await off.pool.end();
    await on.pool.end();
  });

  it("flag off: reading invoices never selects spell_plan_code", async () => {
    sqlOff.length = 0;
    await off.client.invoice.findMany({ where: { userId }, take: 5 });
    await new PrismaInvoiceRepository(off.client as never).findById("does-not-exist");
    const invoiceSql = sqlOff.filter((q) => /FROM\s+"?(public"?\.)?"?invoices/i.test(q));
    expect(invoiceSql.length).toBeGreaterThan(0);
    expect(invoiceSql.join("\n")).not.toContain("spell_plan_code");
  });

  it("flag off: creating and reading a normal invoice never touches spell_plan_code, and the invoice reads back as non-Spell", async () => {
    sqlOff.length = 0;
    const repo = new PrismaInvoiceRepository(off.client as never);
    const created = await repo.create({
      userId,
      amountMnt: 1000,
      currency: "MNT",
      provider: "QPAY",
      status: InvoiceStatus.PENDING,
      expiresAt: new Date(Date.now() + 3_600_000),
    } as never);
    const back = await repo.findById(created.id);
    expect(back?.spellPlanCode ?? null).toBeNull();
    expect(sqlOff.join("\n")).not.toContain("spell_plan_code");
  });

  it("flag on: the column is selected and a Spell invoice keeps its plan code", async () => {
    sqlOn.length = 0;
    const repo = new PrismaInvoiceRepository(on.client as never);
    const created = await repo.create({
      userId,
      amountMnt: 1000,
      currency: "MNT",
      provider: "QPAY",
      status: InvoiceStatus.PENDING,
      expiresAt: new Date(Date.now() + 3_600_000),
      spellPlanCode: "SPELL_1M",
    } as never);
    const back = await repo.findById(created.id);
    expect(back?.spellPlanCode).toBe("SPELL_1M");
    expect(sqlOn.join("\n")).toContain("spell_plan_code");
  });
});
