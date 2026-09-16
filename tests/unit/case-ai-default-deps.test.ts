import { describe, expect, it } from "vitest";

import { defaultCaseAiAnalysisDeps } from "@/application/use-cases/case-review/case-ai-analysis";
import { defaultCaseTimelineDeps } from "@/application/use-cases/case-review/case-timeline";
import { defaultCaseDraftDeps } from "@/application/use-cases/case-review/case-draft";
import { requireOwnedCaseFile } from "@/application/use-cases/case-review/assert-access";
import { PrismaCaseFileRepository } from "@/infrastructure/repositories/prisma-case-file-repository";
import { PrismaCaseAiAnalysisRepository } from "@/infrastructure/repositories/prisma-case-ai-analysis-repository";
import { PrismaCaseTimelineRepository } from "@/infrastructure/repositories/prisma-case-timeline-repository";
import { PrismaCaseDraftRepository } from "@/infrastructure/repositories/prisma-case-draft-repository";
import { UserRole } from "@/domain/enums";

/**
 * Sprint 13 regression coverage — real browser QA found that
 * defaultCaseAiAnalysisDeps() / defaultCaseTimelineDeps() /
 * defaultCaseDraftDeps() resolved `caseFileRepository` to `undefined` at
 * actual page/route runtime, even though every other Sprint 13 test
 * passed, because every other test injects its own `deps` and never
 * exercises these factories. The bug was a runtime `require()` against
 * the `@/infrastructure/repositories` barrel re-entering that barrel
 * mid-initialization (it's also reached via create-legal-ai-service.ts's
 * own static import) and getting back a stale/partial exports snapshot.
 * The fix replaced the runtime require() with concrete static imports.
 *
 * These tests call the real, unmodified default-dependency factories —
 * no injected/mocked repository — and assert the exact property-access
 * pattern that used to throw `Cannot read properties of undefined
 * (reading 'findById')` no longer does. They never perform a real
 * database call (no `.findById()` invocation), so they stay fast and
 * environment-independent while still directly covering the regression.
 */
describe("default dependency factories resolve real repositories (not undefined)", () => {
  it("defaultCaseAiAnalysisDeps() resolves a real, callable caseFileRepository", () => {
    const deps = defaultCaseAiAnalysisDeps();
    expect(deps.caseFileRepository).toBeDefined();
    expect(deps.caseFileRepository).toBeInstanceOf(PrismaCaseFileRepository);
    expect(typeof deps.caseFileRepository.findById).toBe("function");
    expect(deps.analysisRepository).toBeDefined();
    expect(deps.analysisRepository).toBeInstanceOf(PrismaCaseAiAnalysisRepository);
    expect(deps.corpusRetriever).toBeDefined();
    expect(deps.completion).toBeDefined();
  });

  it("defaultCaseTimelineDeps() resolves a real, callable caseFileRepository", () => {
    const deps = defaultCaseTimelineDeps();
    expect(deps.caseFileRepository).toBeDefined();
    expect(deps.caseFileRepository).toBeInstanceOf(PrismaCaseFileRepository);
    expect(typeof deps.caseFileRepository.findById).toBe("function");
    expect(deps.timelineRepository).toBeDefined();
    expect(deps.timelineRepository).toBeInstanceOf(PrismaCaseTimelineRepository);
  });

  it("defaultCaseDraftDeps() resolves a real, callable caseFileRepository", () => {
    const deps = defaultCaseDraftDeps();
    expect(deps.caseFileRepository).toBeDefined();
    expect(deps.caseFileRepository).toBeInstanceOf(PrismaCaseFileRepository);
    expect(typeof deps.caseFileRepository.findById).toBe("function");
    expect(deps.draftRepository).toBeDefined();
    expect(deps.draftRepository).toBeInstanceOf(PrismaCaseDraftRepository);
    expect(deps.corpusRetriever).toBeDefined();
    expect(deps.completion).toBeDefined();
  });

  it("reproduces the exact original crash site and confirms it no longer throws on property access", () => {
    // This is the literal expression from the reported stack trace
    // (assert-access.ts:19 — `await repository.findById(caseId)`).
    // Before the fix, `repository` (deps.caseFileRepository) was
    // `undefined` here, so merely accessing `.findById` threw
    // "Cannot read properties of undefined (reading 'findById')" before
    // any network call was ever attempted.
    const { caseFileRepository } = defaultCaseAiAnalysisDeps();
    expect(() => caseFileRepository.findById).not.toThrow();
    expect(caseFileRepository.findById).toBeInstanceOf(Function);
  });

  it("requireOwnedCaseFile called through the real default caseFileRepository never fails with the undefined-repository TypeError", async () => {
    const actor = { userId: "nonexistent-qa-user", role: UserRole.LAWYER };
    const { caseFileRepository } = defaultCaseAiAnalysisDeps();
    try {
      await requireOwnedCaseFile(actor, "nonexistent-qa-case-id", caseFileRepository);
    } catch (error) {
      // Any failure here must come from the real repository actually
      // running (a connection/lookup outcome), never from the dependency
      // itself being undefined.
      expect(String(error)).not.toMatch(/Cannot read propert(y|ies) of undefined/i);
    }
  }, 15000);
});
