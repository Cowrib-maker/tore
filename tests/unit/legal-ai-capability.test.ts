import { describe, expect, it } from "vitest";

import {
  LegalAiCapability,
  resolveLegalAiCapability,
} from "@/application/ai/legal-ai-capability";
import { UserRole } from "@/domain/enums";

describe("resolveLegalAiCapability", () => {
  it("uses CITIZEN when no authenticated lawyer role is present", () => {
    expect(resolveLegalAiCapability({})).toBe(LegalAiCapability.CITIZEN);
    expect(resolveLegalAiCapability({ actorRole: null })).toBe(
      LegalAiCapability.CITIZEN,
    );
    expect(resolveLegalAiCapability({ actorRole: UserRole.CLIENT })).toBe(
      LegalAiCapability.CITIZEN,
    );
    expect(resolveLegalAiCapability({ actorRole: UserRole.ADMIN })).toBe(
      LegalAiCapability.CITIZEN,
    );
    expect(resolveLegalAiCapability({ actorRole: "LAWYER" })).toBe(
      LegalAiCapability.LAWYER,
    );
  });

  it("does not trust a client-supplied role string other than the authenticated LAWYER enum", () => {
    expect(resolveLegalAiCapability({ actorRole: "PROFESSIONAL" })).toBe(
      LegalAiCapability.CITIZEN,
    );
    expect(resolveLegalAiCapability({ actorRole: "lawyer" })).toBe(
      LegalAiCapability.CITIZEN,
    );
    expect(resolveLegalAiCapability({ actorRole: " CITIZEN " })).toBe(
      LegalAiCapability.CITIZEN,
    );
  });

  it("uses LAWYER only for UserRole.LAWYER", () => {
    expect(resolveLegalAiCapability({ actorRole: UserRole.LAWYER })).toBe(
      LegalAiCapability.LAWYER,
    );
  });
});
