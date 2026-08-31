import { IntentType } from "@/engine/intent";
import type { LegalAiCapability } from "@/application/ai/legal-ai-capability";

/**
 * Lawyer (and citizen) task classification. Selects which reasoning
 * stages to run — not every turn goes through the full pipeline.
 */
export const LegalAiTaskType = {
  LEGAL_RESEARCH: "LEGAL_RESEARCH",
  CASE_ANALYSIS: "CASE_ANALYSIS",
  EVIDENCE_ANALYSIS: "EVIDENCE_ANALYSIS",
  ISSUE_SPOTTING: "ISSUE_SPOTTING",
  PROVISION_LOOKUP: "PROVISION_LOOKUP",
  DOCUMENT_REVIEW: "DOCUMENT_REVIEW",
  ARGUMENT_ANALYSIS: "ARGUMENT_ANALYSIS",
  COUNTERARGUMENT: "COUNTERARGUMENT",
  DRAFTING: "DRAFTING",
  PROCEDURAL_GUIDANCE: "PROCEDURAL_GUIDANCE",
  CASE_SUMMARY: "CASE_SUMMARY",
  GENERAL_LEGAL: "GENERAL_LEGAL",
} as const;

export type LegalAiTaskType =
  (typeof LegalAiTaskType)[keyof typeof LegalAiTaskType];

export const LegalAiReasoningStage = {
  INTENT: "INTENT",
  CASE_CONTEXT: "CASE_CONTEXT",
  DOCUMENT_CONTEXT: "DOCUMENT_CONTEXT",
  LEGAL_RETRIEVAL: "LEGAL_RETRIEVAL",
  ISSUE_SPOTTING: "ISSUE_SPOTTING",
  APPLICABLE_LAW: "APPLICABLE_LAW",
  LEGAL_TEST: "LEGAL_TEST",
  FACT_ELEMENT_MAPPING: "FACT_ELEMENT_MAPPING",
  EVIDENCE_SUPPORT: "EVIDENCE_SUPPORT",
  GAPS_CONTRADICTIONS: "GAPS_CONTRADICTIONS",
  ARGUMENTS_FOR: "ARGUMENTS_FOR",
  ARGUMENTS_AGAINST: "ARGUMENTS_AGAINST",
  RISKS: "RISKS",
  CONCLUSION: "CONCLUSION",
  CITATIONS: "CITATIONS",
} as const;

export type LegalAiReasoningStage =
  (typeof LegalAiReasoningStage)[keyof typeof LegalAiReasoningStage];

const LAWYER_CORE: readonly LegalAiReasoningStage[] = [
  LegalAiReasoningStage.INTENT,
  LegalAiReasoningStage.LEGAL_RETRIEVAL,
  LegalAiReasoningStage.APPLICABLE_LAW,
  LegalAiReasoningStage.CONCLUSION,
  LegalAiReasoningStage.CITATIONS,
];

const TASK_STAGES: Record<LegalAiTaskType, readonly LegalAiReasoningStage[]> = {
  LEGAL_RESEARCH: [
    ...LAWYER_CORE,
    LegalAiReasoningStage.ISSUE_SPOTTING,
    LegalAiReasoningStage.GAPS_CONTRADICTIONS,
  ],
  CASE_ANALYSIS: [
    LegalAiReasoningStage.INTENT,
    LegalAiReasoningStage.CASE_CONTEXT,
    LegalAiReasoningStage.DOCUMENT_CONTEXT,
    LegalAiReasoningStage.LEGAL_RETRIEVAL,
    LegalAiReasoningStage.ISSUE_SPOTTING,
    LegalAiReasoningStage.APPLICABLE_LAW,
    LegalAiReasoningStage.LEGAL_TEST,
    LegalAiReasoningStage.FACT_ELEMENT_MAPPING,
    LegalAiReasoningStage.EVIDENCE_SUPPORT,
    LegalAiReasoningStage.GAPS_CONTRADICTIONS,
    LegalAiReasoningStage.ARGUMENTS_FOR,
    LegalAiReasoningStage.ARGUMENTS_AGAINST,
    LegalAiReasoningStage.RISKS,
    LegalAiReasoningStage.CONCLUSION,
    LegalAiReasoningStage.CITATIONS,
  ],
  EVIDENCE_ANALYSIS: [
    LegalAiReasoningStage.INTENT,
    LegalAiReasoningStage.CASE_CONTEXT,
    LegalAiReasoningStage.DOCUMENT_CONTEXT,
    LegalAiReasoningStage.LEGAL_RETRIEVAL,
    LegalAiReasoningStage.EVIDENCE_SUPPORT,
    LegalAiReasoningStage.FACT_ELEMENT_MAPPING,
    LegalAiReasoningStage.GAPS_CONTRADICTIONS,
    LegalAiReasoningStage.CONCLUSION,
    LegalAiReasoningStage.CITATIONS,
  ],
  ISSUE_SPOTTING: [
    LegalAiReasoningStage.INTENT,
    LegalAiReasoningStage.CASE_CONTEXT,
    LegalAiReasoningStage.LEGAL_RETRIEVAL,
    LegalAiReasoningStage.ISSUE_SPOTTING,
    LegalAiReasoningStage.GAPS_CONTRADICTIONS,
    LegalAiReasoningStage.CONCLUSION,
    LegalAiReasoningStage.CITATIONS,
  ],
  PROVISION_LOOKUP: [
    LegalAiReasoningStage.INTENT,
    LegalAiReasoningStage.LEGAL_RETRIEVAL,
    LegalAiReasoningStage.APPLICABLE_LAW,
    LegalAiReasoningStage.CITATIONS,
  ],
  DOCUMENT_REVIEW: [
    LegalAiReasoningStage.INTENT,
    LegalAiReasoningStage.DOCUMENT_CONTEXT,
    LegalAiReasoningStage.LEGAL_RETRIEVAL,
    LegalAiReasoningStage.ISSUE_SPOTTING,
    LegalAiReasoningStage.GAPS_CONTRADICTIONS,
    LegalAiReasoningStage.RISKS,
    LegalAiReasoningStage.CONCLUSION,
    LegalAiReasoningStage.CITATIONS,
  ],
  ARGUMENT_ANALYSIS: [
    ...LAWYER_CORE,
    LegalAiReasoningStage.CASE_CONTEXT,
    LegalAiReasoningStage.LEGAL_TEST,
    LegalAiReasoningStage.ARGUMENTS_FOR,
    LegalAiReasoningStage.ARGUMENTS_AGAINST,
    LegalAiReasoningStage.RISKS,
  ],
  COUNTERARGUMENT: [
    LegalAiReasoningStage.INTENT,
    LegalAiReasoningStage.CASE_CONTEXT,
    LegalAiReasoningStage.LEGAL_RETRIEVAL,
    LegalAiReasoningStage.ARGUMENTS_AGAINST,
    LegalAiReasoningStage.RISKS,
    LegalAiReasoningStage.CONCLUSION,
    LegalAiReasoningStage.CITATIONS,
  ],
  DRAFTING: [
    LegalAiReasoningStage.INTENT,
    LegalAiReasoningStage.CASE_CONTEXT,
    LegalAiReasoningStage.DOCUMENT_CONTEXT,
    LegalAiReasoningStage.LEGAL_RETRIEVAL,
    LegalAiReasoningStage.APPLICABLE_LAW,
    LegalAiReasoningStage.CONCLUSION,
    LegalAiReasoningStage.CITATIONS,
  ],
  PROCEDURAL_GUIDANCE: [
    ...LAWYER_CORE,
    LegalAiReasoningStage.RISKS,
    LegalAiReasoningStage.GAPS_CONTRADICTIONS,
  ],
  CASE_SUMMARY: [
    LegalAiReasoningStage.INTENT,
    LegalAiReasoningStage.CASE_CONTEXT,
    LegalAiReasoningStage.DOCUMENT_CONTEXT,
    LegalAiReasoningStage.LEGAL_RETRIEVAL,
    LegalAiReasoningStage.ISSUE_SPOTTING,
    LegalAiReasoningStage.CONCLUSION,
    LegalAiReasoningStage.CITATIONS,
  ],
  GENERAL_LEGAL: [
    LegalAiReasoningStage.INTENT,
    LegalAiReasoningStage.LEGAL_RETRIEVAL,
    LegalAiReasoningStage.ISSUE_SPOTTING,
    LegalAiReasoningStage.APPLICABLE_LAW,
    LegalAiReasoningStage.CONCLUSION,
    LegalAiReasoningStage.CITATIONS,
  ],
};

const CITIZEN_STAGES: readonly LegalAiReasoningStage[] = [
  LegalAiReasoningStage.INTENT,
  LegalAiReasoningStage.DOCUMENT_CONTEXT,
  LegalAiReasoningStage.LEGAL_RETRIEVAL,
  LegalAiReasoningStage.APPLICABLE_LAW,
  LegalAiReasoningStage.CONCLUSION,
  LegalAiReasoningStage.CITATIONS,
];

export type ClassifyLegalAiTaskInput = {
  capability: LegalAiCapability;
  intent: IntentType;
  hasCaseContext: boolean;
  hasDocument: boolean;
  message: string;
};

export function classifyLegalAiTask(
  input: ClassifyLegalAiTaskInput,
): LegalAiTaskType {
  if (input.capability !== "LAWYER") {
    return LegalAiTaskType.GENERAL_LEGAL;
  }

  const text = input.message.toLowerCase();

  if (matches(text, [/эсрэг\s*байр/, /counter-?argu/, /хамгаалалт/, /defense/])) {
    return LegalAiTaskType.COUNTERARGUMENT;
  }
  if (matches(text, [/боловсруул/, /draft/, /бичиг\s*бэлтгэ/, /нэхэмжлэл\s*бич/])) {
    return LegalAiTaskType.DRAFTING;
  }
  if (matches(text, [/тоймло/, /summar/, /товчлон/])) {
    return LegalAiTaskType.CASE_SUMMARY;
  }
  if (
    matches(text, [
      /нотлох\s*баримт/,
      /evidence/,
      /баримт\s*үнэл/,
      /exhibit/,
    ])
  ) {
    return LegalAiTaskType.EVIDENCE_ANALYSIS;
  }
  if (matches(text, [/асуудал\s*тодорхойлох/, /issue\s*spot/, /ямар\s*асуудал/])) {
    return LegalAiTaskType.ISSUE_SPOTTING;
  }
  if (
    matches(text, [
      /зүйл/,
      /заалт/,
      /хуулийн\s*\d/,
      /article/,
      /provision/,
    ]) &&
    !input.hasCaseContext
  ) {
    return LegalAiTaskType.PROVISION_LOOKUP;
  }
  if (matches(text, [/процесс/, /журам/, /процедур/, /хугацаа/, /deadline/])) {
    return LegalAiTaskType.PROCEDURAL_GUIDANCE;
  }
  if (matches(text, [/аргумент/, /байр\s*суурь/, /яллах/, /нэхэмжлэл/])) {
    return LegalAiTaskType.ARGUMENT_ANALYSIS;
  }

  if (input.intent === IntentType.DOCUMENT_REVIEW || input.hasDocument) {
    return LegalAiTaskType.DOCUMENT_REVIEW;
  }
  if (input.intent === IntentType.DOCUMENT_DRAFTING) {
    return LegalAiTaskType.DRAFTING;
  }
  if (input.intent === IntentType.CASE_ANALYSIS || input.hasCaseContext) {
    return LegalAiTaskType.CASE_ANALYSIS;
  }
  if (input.intent === IntentType.LEGAL_RESEARCH) {
    return LegalAiTaskType.LEGAL_RESEARCH;
  }

  return LegalAiTaskType.GENERAL_LEGAL;
}

export function stagesForTask(
  capability: LegalAiCapability,
  task: LegalAiTaskType,
  input: { hasCaseContext: boolean; hasDocument: boolean },
): LegalAiReasoningStage[] {
  const base =
    capability === "CITIZEN"
      ? CITIZEN_STAGES
      : (TASK_STAGES[task] ?? LAWYER_CORE);

  return base.filter((stage) => {
    if (stage === LegalAiReasoningStage.CASE_CONTEXT && !input.hasCaseContext) {
      return false;
    }
    if (stage === LegalAiReasoningStage.DOCUMENT_CONTEXT && !input.hasDocument) {
      return false;
    }
    return true;
  });
}

export function taskRequiresLegalRetrieval(task: LegalAiTaskType): boolean {
  const stages = TASK_STAGES[task] ?? LAWYER_CORE;
  return stages.includes(LegalAiReasoningStage.LEGAL_RETRIEVAL);
}

function matches(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}
