import { describe, expect, it } from "vitest";

import {
  buildLawyerSlugCandidate,
  generateLawyerSlug,
  slugifyDisplayName,
} from "@/domain/services/slug-generator";

describe("slugifyDisplayName", () => {
  it("normalizes spaces and case", () => {
    expect(slugifyDisplayName("  Erdene Bayr ")).toBe("erdene-bayr");
  });

  it("strips unsupported characters", () => {
    expect(slugifyDisplayName("A@B#C!")).toBe("abc");
  });

  it("falls back when empty after cleanup", () => {
    expect(slugifyDisplayName("@@@")).toBe("lawyer");
  });
});

describe("buildLawyerSlugCandidate", () => {
  it("appends suffix and stays within length", () => {
    const slug = buildLawyerSlugCandidate("Ada Lovelace", "x1y2z3");
    expect(slug).toBe("ada-lovelace-x1y2z3");
  });
});

describe("generateLawyerSlug", () => {
  it("returns a non-empty slug with a suffix", () => {
    const slug = generateLawyerSlug("Bat Erdene");
    expect(slug.startsWith("bat-erdene-")).toBe(true);
    expect(slug.length).toBeGreaterThan("bat-erdene-".length);
  });
});
