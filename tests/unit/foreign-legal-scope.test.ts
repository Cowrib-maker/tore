import { describe, expect, it } from "vitest";

import { detectForeignLegalScope } from "@/engine/relevance/foreign-legal-scope";

describe("detectForeignLegalScope", () => {
  it("detects US and Delaware practice questions", () => {
    const scope = detectForeignLegalScope(
      "Delaware LLC fiduciary duty болон US law firm practice-ийг тайлбарла",
    );
    expect(scope).not.toBeNull();
    expect(scope?.labels).toEqual(expect.arrayContaining(["US", "Delaware"]));
    expect(scope?.includesPractice).toBe(true);
    expect(scope?.comparativeWithMn).toBe(false);
  });

  it("detects GDPR and UK common law", () => {
    expect(detectForeignLegalScope("GDPR controller vs processor ялгаа юу вэ?")?.labels).toContain(
      "GDPR",
    );
    expect(
      detectForeignLegalScope("Английн common law-д precedent хэрхэн үйлчлэх вэ?"),
    ).not.toBeNull();
  });

  it("marks comparative questions that also mention Mongolia", () => {
    const scope = detectForeignLegalScope(
      "Монголын Иргэний хууль болон Калифорнийн contract law-г харьцуул",
    );
    expect(scope?.comparativeWithMn).toBe(true);
    expect(scope?.labels).toEqual(expect.arrayContaining(["California"]));
  });

  it("does not treat a Mongolian-only question as foreign", () => {
    expect(
      detectForeignLegalScope("Хөдөлмөрийн гэрээг хэрхэн цуцлах вэ?"),
    ).toBeNull();
  });
});
