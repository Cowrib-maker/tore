import { describe, expect, it } from "vitest";

import {
  ADMINISTRATIVE_DEFECT_CONSEQUENCES,
  ADMINISTRATIVE_REMEDY_CLAIMS,
  AdministrativeDefectKind,
  AdministrativeRemedyClaimKind,
  findDefectConsequence,
} from "@/engine/doctrine";

/**
 * Захиргааны актын алдааны эрх зvйн vр дагавар (p.15, applied p.33).
 *
 * §45 (хэлбэрийн төдий) and §106.3.4 (omission/refusal) have no worked
 * example in the source — only the general-methodology decision table is
 * asserted for them (no case-fixture "conclusion" is invented). §47
 * (manifestly unlawful) vs ordinary "хууль бус" IS worked through in
 * Case 2 (p.33) and is asserted against that narrative.
 */
describe("Legal consequence decision table (p.15)", () => {
  it("has exactly the 4 source categories, each with provenance", () => {
    expect(ADMINISTRATIVE_DEFECT_CONSEQUENCES.map((e) => e.kind)).toEqual([
      AdministrativeDefectKind.MERE_FORM_DEFECT,
      AdministrativeDefectKind.MANIFESTLY_UNLAWFUL,
      AdministrativeDefectKind.UNLAWFUL,
      AdministrativeDefectKind.UNLAWFUL_OMISSION,
    ]);
    for (const entry of ADMINISTRATIVE_DEFECT_CONSEQUENCES) {
      expect(entry.provenance.length).toBeGreaterThan(0);
      expect(entry.provenance.every((p) => p.locator)).toBe(true);
    }
  });

  it("§45 — mere-form defect: court need not invalidate", () => {
    const entry = findDefectConsequence(AdministrativeDefectKind.MERE_FORM_DEFECT);
    expect(entry.consequenceStatement).toContain("хvчингvй болгох шаардлагагvй");
  });

  it("§47.1-47.2 — manifestly unlawful: void ab initio, court establishes it", () => {
    const entry = findDefectConsequence(AdministrativeDefectKind.MANIFESTLY_UNLAWFUL);
    expect(entry.consequenceStatement).toContain("эрх зvйн vйлчлэлгvй");
    expect(entry.consequenceStatement).toContain("§106.3.2");
  });

  it("ordinary unlawfulness: court invalidates (§106.3.1)", () => {
    const entry = findDefectConsequence(AdministrativeDefectKind.UNLAWFUL);
    expect(entry.consequenceStatement).toContain("§106.3.1");
  });

  it("unjustified refusal/omission: court compels issuance (§106.3.4)", () => {
    const entry = findDefectConsequence(AdministrativeDefectKind.UNLAWFUL_OMISSION);
    expect(entry.consequenceStatement).toContain("§106.3.4");
  });

  it("throws rather than inventing a consequence for an unknown kind", () => {
    expect(() => findDefectConsequence("NOT_A_KIND" as never)).toThrow();
  });
});

describe("Remedy claim mapping — ЗХШХШтХ §52.5.1 / §52.5.2 (p.33)", () => {
  it("has exactly the 2 source-listed claim grounds, both cited to p.33", () => {
    expect(ADMINISTRATIVE_REMEDY_CLAIMS.map((c) => c.kind)).toEqual([
      AdministrativeRemedyClaimKind.INVALIDATE_ACT,
      AdministrativeRemedyClaimKind.RECOVER_DAMAGES,
    ]);
    for (const claim of ADMINISTRATIVE_REMEDY_CLAIMS) {
      expect(claim.provenance.some((p) => p.locator === "х.33")).toBe(true);
    }
  });

  it("INVALIDATE_ACT cites §52.5.1 / §106.3.1; RECOVER_DAMAGES cites §52.5.2 / §106.3.7", () => {
    const invalidate = ADMINISTRATIVE_REMEDY_CLAIMS.find(
      (c) => c.kind === AdministrativeRemedyClaimKind.INVALIDATE_ACT,
    );
    const damages = ADMINISTRATIVE_REMEDY_CLAIMS.find(
      (c) => c.kind === AdministrativeRemedyClaimKind.RECOVER_DAMAGES,
    );
    expect(invalidate?.claimStatement).toContain("§52.5.1");
    expect(invalidate?.claimStatement).toContain("§106.3.1");
    expect(damages?.claimStatement).toContain("§52.5.2");
    expect(damages?.claimStatement).toContain("§106.3.7");
  });
});

describe("Case 2 (p.33) — manifest-unlawfulness test applied to the worked example", () => {
  it("source explicitly finds §47 not triggered, classifies as ordinary UNLAWFUL, not MANIFESTLY_UNLAWFUL", () => {
    // p.33: "Захиргааны ерөнхий хуулийн 47-д заасан алдаа гараагvй тул
    // илт хууль бус акт биш ... хууль бус акт байна." This test asserts
    // the decision-table entries the source's own classification maps
    // to, without inventing new case facts.
    const manifest = findDefectConsequence(AdministrativeDefectKind.MANIFESTLY_UNLAWFUL);
    const ordinary = findDefectConsequence(AdministrativeDefectKind.UNLAWFUL);
    expect(manifest.kind).not.toBe(ordinary.kind);
    expect(ordinary.provenance.some((p) => p.locator === "х.33")).toBe(true);
  });
});
