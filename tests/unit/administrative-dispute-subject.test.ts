import { describe, expect, it } from "vitest";

import {
  ADMINISTRATIVE_DISPUTE_SUBJECT_LABELS,
  AdministrativeDisputeSubject,
} from "@/engine/doctrine";

/**
 * Source: methodology handbook p.9, verbatim — "захиргааны акт",
 * "захиргааны гэрээ", "захиргааны хэм хэмжээний акт", "эрх зvйн харилцаа",
 * "бусад захиргааны хууль бус vйл ажиллагаа". Classification branch only —
 * no substantive doctrine invented for the 4 non-act categories.
 */
describe("AdministrativeDisputeSubject (p.9)", () => {
  it("has exactly the 5 source-listed categories", () => {
    expect(Object.values(AdministrativeDisputeSubject).sort()).toEqual(
      [
        "ADMINISTRATIVE_ACT",
        "ADMINISTRATIVE_CONTRACT",
        "ADMINISTRATIVE_NORMATIVE_ACT",
        "LEGAL_RELATIONSHIP",
        "OTHER_UNLAWFUL_ADMINISTRATIVE_ACTIVITY",
      ].sort(),
    );
  });

  it("carries the source's verbatim Mongolian labels", () => {
    expect(ADMINISTRATIVE_DISPUTE_SUBJECT_LABELS[AdministrativeDisputeSubject.ADMINISTRATIVE_ACT]).toBe(
      "захиргааны акт",
    );
    expect(
      ADMINISTRATIVE_DISPUTE_SUBJECT_LABELS[AdministrativeDisputeSubject.ADMINISTRATIVE_CONTRACT],
    ).toBe("захиргааны гэрээ");
    expect(
      ADMINISTRATIVE_DISPUTE_SUBJECT_LABELS[
        AdministrativeDisputeSubject.ADMINISTRATIVE_NORMATIVE_ACT
      ],
    ).toBe("захиргааны хэм хэмжээний акт");
    expect(
      ADMINISTRATIVE_DISPUTE_SUBJECT_LABELS[AdministrativeDisputeSubject.LEGAL_RELATIONSHIP],
    ).toBe("эрх зvйн харилцаа");
    expect(
      ADMINISTRATIVE_DISPUTE_SUBJECT_LABELS[
        AdministrativeDisputeSubject.OTHER_UNLAWFUL_ADMINISTRATIVE_ACTIVITY
      ],
    ).toBe("бусад захиргааны хууль бус vйл ажиллагаа");
  });
});
