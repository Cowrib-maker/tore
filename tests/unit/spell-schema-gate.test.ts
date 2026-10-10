import { describe, expect, it } from "vitest";

import { spellColumnsOmit } from "@/infrastructure/database/spell-schema-gate";

describe("spellColumnsOmit — Spell columns stay out of queries until Spell is enabled", () => {
  it("omits invoices.spell_plan_code while TORE_SPELL_V1 is off (the migration may not be applied yet)", () => {
    expect(spellColumnsOmit(false)).toEqual({ invoice: { spellPlanCode: true } });
  });
  it("reads and writes the column once Spell is enabled (the deployment checklist requires the migrations first)", () => {
    expect(spellColumnsOmit(true)).toEqual({ invoice: { spellPlanCode: false } });
  });
});
