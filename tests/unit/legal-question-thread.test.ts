import { describe, expect, it } from "vitest";

import { decideLegalQuestionThreadAction } from "@/domain/legal-ai/legal-question-thread";
import { LegalQuestionStatus } from "@/domain/enums";
import { LegalRelevance } from "@/engine/relevance";

describe("decideLegalQuestionThreadAction", () => {
  it("starts NEW → CLARIFYING on POSSIBLY_LEGAL and bills the thread", () => {
    expect(
      decideLegalQuestionThreadAction({
        status: LegalQuestionStatus.NEW,
        relevance: LegalRelevance.POSSIBLY_LEGAL,
      }),
    ).toEqual({
      type: "START_NEW",
      nextStatus: LegalQuestionStatus.CLARIFYING,
    });
  });

  it("keeps clarification in the same thread", () => {
    expect(
      decideLegalQuestionThreadAction({
        status: LegalQuestionStatus.CLARIFYING,
        relevance: LegalRelevance.LEGAL,
      }),
    ).toEqual({
      type: "CONTINUE",
      nextStatus: LegalQuestionStatus.ANSWERED,
    });
  });

  it("marks a confident legal answer as ANSWERED", () => {
    expect(
      decideLegalQuestionThreadAction({
        status: LegalQuestionStatus.NEW,
        relevance: LegalRelevance.LEGAL,
      }),
    ).toEqual({
      type: "START_NEW",
      nextStatus: LegalQuestionStatus.ANSWERED,
    });
  });

  it("starts a new billable question after ANSWERED", () => {
    expect(
      decideLegalQuestionThreadAction({
        status: LegalQuestionStatus.ANSWERED,
        relevance: LegalRelevance.LEGAL,
      }),
    ).toEqual({
      type: "START_NEW",
      nextStatus: LegalQuestionStatus.ANSWERED,
    });
  });

  it("does not bill NON_LEGAL refusals", () => {
    expect(
      decideLegalQuestionThreadAction({
        status: LegalQuestionStatus.NEW,
        relevance: LegalRelevance.NON_LEGAL,
      }),
    ).toEqual({
      type: "REFUSE_NON_LEGAL",
      nextStatus: LegalQuestionStatus.NEW,
    });
    expect(
      decideLegalQuestionThreadAction({
        status: LegalQuestionStatus.ANSWERED,
        relevance: LegalRelevance.NON_LEGAL,
      }),
    ).toEqual({
      type: "REFUSE_NON_LEGAL",
      nextStatus: LegalQuestionStatus.ANSWERED,
    });
  });
});
