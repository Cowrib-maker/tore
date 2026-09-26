import { describe, expect, it } from "vitest";

import {
  decideLegalQuestionThreadAction,
  threadReservesEntitlement,
} from "@/domain/legal-ai/legal-question-thread";
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

  it("answers NON_LEGAL without perturbing the legal-question status machine", () => {
    expect(
      decideLegalQuestionThreadAction({
        status: LegalQuestionStatus.NEW,
        relevance: LegalRelevance.NON_LEGAL,
      }),
    ).toEqual({
      type: "ANSWER_NON_LEGAL",
      nextStatus: LegalQuestionStatus.NEW,
    });
    expect(
      decideLegalQuestionThreadAction({
        status: LegalQuestionStatus.ANSWERED,
        relevance: LegalRelevance.NON_LEGAL,
      }),
    ).toEqual({
      type: "ANSWER_NON_LEGAL",
      nextStatus: LegalQuestionStatus.ANSWERED,
    });
  });

  describe("threadReservesEntitlement", () => {
    it("reserves the entitlement for a new legal question and a general question alike", () => {
      expect(threadReservesEntitlement({ type: "START_NEW", nextStatus: LegalQuestionStatus.ANSWERED })).toBe(true);
      expect(threadReservesEntitlement({ type: "ANSWER_NON_LEGAL", nextStatus: LegalQuestionStatus.NEW })).toBe(true);
    });

    it("does not reserve a second entitlement for a clarification continuation", () => {
      expect(threadReservesEntitlement({ type: "CONTINUE", nextStatus: LegalQuestionStatus.ANSWERED })).toBe(false);
    });
  });
});
