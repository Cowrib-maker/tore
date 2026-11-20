import { detectExactCitation } from "@/engine/citation";
import type { LegalCorpusRetriever } from "@/application/ai/legal-corpus";
import {
  resolveLegalAuthorities,
  type ResolveLegalAuthoritiesResult,
  type ResolvedLegalAuthority,
} from "@/application/ai/resolve-legal-authorities";
import type { AsyncGraphRepository, ConflictFinding } from "@/engine/graph";
import { ValidationError } from "@/domain/errors/domain-error";

/**
 * TORE Legal Research Agent — first vertical slice (read-only, request-scoped, no LLM).
 *
 * question -> bounded plan -> allowlisted read-only tools -> traceable findings -> structured, auditable result.
 *
 * What it is NOT: it does not interpret the law and does not write an AI answer. Every "finding" is a provision that the existing
 * resolveLegalAuthorities pipeline returned this run, with provenance attached. Only an EXACT citation is officially verified by that
 * pipeline; an open question yields score-thresholded corpus search matches, which are labelled as such and never presented as verified.
 * The short answer is a fixed description of the evidence found, never a legal conclusion. Nothing is persisted, billed or sent anywhere.
 *
 * Safety boundaries enforced here (server side, whatever produced the plan):
 *  - tools come from a closed allowlist; unknown tools / extra or malformed arguments are rejected, never "best-effort" executed;
 *  - at most MAX_STEPS steps (one tool call each); each call has a timeout; the whole run has a deadline; an AbortSignal cancels it;
 *  - the question is only ever used as search DATA — it cannot add tools, steps or arguments;
 *  - every finding is checked to trace back to an authority a tool call returned in this run; anything else is dropped and reported.
 */

export const LEGAL_RESEARCH_LIMITS = {
  QUESTION_MIN_LENGTH: 3,
  QUESTION_MAX_LENGTH: 2000,
  QUERY_MAX_LENGTH: 2000,
  MAX_STEPS: 3,
  TOOL_TIMEOUT_MS: 15_000,
  DEADLINE_MS: 30_000,
  MAX_FINDINGS: 5,
} as const;

/** Closed allowlist. Both tools are read-only lookups against the existing verified legal corpus. */
export const LEGAL_RESEARCH_TOOLS = ["search_provisions", "lookup_citation"] as const;
export type LegalResearchToolName = (typeof LEGAL_RESEARCH_TOOLS)[number];

export type ResearchStep = { tool: LegalResearchToolName; query: string };

/**
 * Optional source of a plan (e.g. a model in a later version). Its output is UNTRUSTED: it is validated by {@link validatePlan}.
 * The default planner is deterministic and needs no model.
 */
export type ResearchPlanner = { plan(question: string, signal?: AbortSignal): Promise<unknown> };

export type ResearchFinding = {
  title: string;
  locator: string;
  article: string | null;
  paragraph: string | null;
  excerpt: string;
  provenance: {
    documentId: string;
    documentVersionId: string;
    nodeId: string;
    sourceType: string;
    sourceUrl: string | null;
    sourceVersion: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
  };
  /** Current-status caution from existing temporal evidence, when it is not plain "in force". */
  validityNote: string | null;
  foundBy: LegalResearchToolName;
  /**
   * EXACT_CITATION_VERIFIED: the user's own citation was uniquely verified against the official source by the existing pipeline.
   * SEARCH_MATCH: retrieved from the corpus for an open question (provenance-filtered, score-thresholded). It is NOT a determination
   * that the provision applies to the user's situation.
   */
  evidence: "EXACT_CITATION_VERIFIED" | "SEARCH_MATCH";
};

export type ResearchStepRecord = {
  tool: LegalResearchToolName;
  outcome: "verified" | "refused" | "empty" | "timeout" | "error" | "cancelled";
  authorityCount: number;
};

export type LegalResearchStatus =
  /**
   * At least one source-linked provision was returned (see each finding's `evidence`). This does NOT mean the provision applies to the
   * user's situation, and only EXACT_CITATION_VERIFIED findings were officially verified; SEARCH_MATCH findings are search matches.
   */
  | "SUPPORTED"
  /** Nothing verifiable was found (no match, unverified citation, or sources unavailable). */
  | "NO_VERIFIED_EVIDENCE"
  /** The run was stopped before it could finish (deadline, cancellation). */
  | "INCOMPLETE";

export type LegalResearchResult = {
  question: string;
  status: LegalResearchStatus;
  /** Fixed description of the evidence found. Not an interpretation or legal advice. */
  summary: string;
  findings: ResearchFinding[];
  /** What is NOT established: conflicts, validity cautions, rejected plan steps, dropped findings. */
  uncertainty: string[];
  /** What is missing or was unavailable. */
  limitations: string[];
  nextSteps: string[];
  audit: {
    steps: ResearchStepRecord[];
    toolCalls: number;
    rejectedPlanSteps: number;
    droppedFindings: number;
    planner: "deterministic" | "external";
  };
  disclaimer: string;
};

export const LEGAL_RESEARCH_DISCLAIMER =
  "Энэ нь эрх зүйн зөвлөгөө биш. TORE-ийн баталгаажсан эх сурвалжаас олдсон заалтуудын жагсаалт бөгөөд эцсийн дүгнэлтийг мэргэжлийн хуульчтай нягталж гаргана уу.";

const NEXT_STEPS_BASE = [
  "Олдсон заалтыг албан ёсны эх сурвалжаас (legalinfo.mn) нягтлан шалгана уу.",
  "Хэргийн бодит нөхцөл байдалд хэрхэн хамаарахыг мэргэжлийн хуульчаас лавлана уу.",
];
const NEXT_STEPS_NO_EVIDENCE = [
  "Асуултаа илүү тодорхой болгож (хууль, зүйл, нөхцөл байдал) дахин оролдоно уу.",
  "Баталгаатай эх сурвалж олдоогүй тул мэргэжлийн хуульчаас лавлана уу.",
];

export type LegalResearchAgentDeps = {
  retriever: LegalCorpusRetriever;
  graphRepository?: AsyncGraphRepository;
  /** Omitted = deterministic plan. */
  planner?: ResearchPlanner;
  /** Injectable for deterministic tests. */
  timers?: { toolTimeoutMs?: number; deadlineMs?: number };
};

export type RunLegalResearchInput = { question: string; signal?: AbortSignal };

/** Validates and normalizes the question. Throws ValidationError (HTTP 400) — never reaches any tool. */
export function validateResearchQuestion(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ValidationError("Судалгааны асуултаа бичнэ үү.");
  }
  const question = raw.trim();
  if (question.length < LEGAL_RESEARCH_LIMITS.QUESTION_MIN_LENGTH) {
    throw new ValidationError("Судалгааны асуултаа бичнэ үү.");
  }
  if (question.length > LEGAL_RESEARCH_LIMITS.QUESTION_MAX_LENGTH) {
    throw new ValidationError(
      `Судалгааны асуулт ${LEGAL_RESEARCH_LIMITS.QUESTION_MAX_LENGTH} тэмдэгтээс хэтрэхгүй байх ёстой.`,
    );
  }
  return question;
}

/** Deterministic plan: an exact citation in the question is looked up as such; anything else is a provision search. */
export function defaultPlan(question: string): ResearchStep[] {
  return [{ tool: detectExactCitation(question) ? "lookup_citation" : "search_provisions", query: question }];
}

const STEP_KEYS = new Set(["tool", "query"]);
const isAllowlistedTool = (value: unknown): value is LegalResearchToolName =>
  typeof value === "string" && (LEGAL_RESEARCH_TOOLS as readonly string[]).includes(value);

/**
 * Server-side validation of an untrusted plan. A step is accepted only if it is a plain object with exactly `tool` (allowlisted) and
 * `query` (non-empty string within the length limit). Everything else is counted as rejected and never executed. Steps beyond
 * MAX_STEPS are rejected as well.
 */
export function validatePlan(raw: unknown): { steps: ResearchStep[]; rejected: number; malformed: boolean } {
  if (!Array.isArray(raw)) return { steps: [], rejected: 0, malformed: true };
  const steps: ResearchStep[] = [];
  let rejected = 0;
  for (const item of raw) {
    const ok =
      steps.length < LEGAL_RESEARCH_LIMITS.MAX_STEPS &&
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      Object.keys(item).every((key) => STEP_KEYS.has(key)) &&
      isAllowlistedTool((item as Record<string, unknown>).tool) &&
      typeof (item as Record<string, unknown>).query === "string" &&
      ((item as Record<string, string>).query.trim().length > 0) &&
      (item as Record<string, string>).query.trim().length <= LEGAL_RESEARCH_LIMITS.QUERY_MAX_LENGTH;
    if (!ok) {
      rejected += 1;
      continue;
    }
    steps.push({
      tool: (item as { tool: LegalResearchToolName }).tool,
      query: (item as { query: string }).query.trim(),
    });
  }
  return { steps, rejected, malformed: false };
}

class RunStopped extends Error {
  constructor(readonly reason: "timeout" | "cancelled") {
    super(reason);
  }
}

/** Races `work` against a timeout and the abort signal. The underlying call cannot be force-stopped, but its result is ignored. */
function bounded<T>(work: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) return reject(new RunStopped("cancelled"));
    const timer = setTimeout(() => finish(() => reject(new RunStopped("timeout"))), timeoutMs);
    const onAbort = () => finish(() => reject(new RunStopped("cancelled")));
    let done = false;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      settle();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

function validityNoteFor(authority: ResolvedLegalAuthority): string | null {
  const validity = authority.temporalValidity;
  if (!validity) return null;
  switch (validity.status) {
    case "REPEALED":
      return "Энэ эх сурвалж хүчингүй болсон гэсэн шууд баримт бүртгэгдсэн байна.";
    case "EXPIRED":
      return "Энэ эх сурвалжийн хүчинтэй хугацаа дууссан.";
    case "HISTORICALLY_IN_FORCE":
      return "Зөвхөн тодорхой түүхэн хугацаанд хүчинтэй байсан нь нотлогдсон; өнөөдөр хүчинтэй эсэх нь тогтоогдоогүй.";
    default:
      return null;
  }
}

function toFinding(
  authority: ResolvedLegalAuthority,
  foundBy: LegalResearchToolName,
  source: "exact" | "question",
): ResearchFinding {
  return {
    title: authority.title,
    locator: authority.locator,
    article: authority.article,
    paragraph: authority.paragraph,
    excerpt: authority.excerpt,
    provenance: {
      documentId: authority.documentId,
      documentVersionId: authority.documentVersionId,
      nodeId: authority.nodeId,
      sourceType: authority.sourceType,
      sourceUrl: authority.sourceUrl,
      sourceVersion: authority.sourceVersion,
      effectiveFrom: authority.effectiveFrom,
      effectiveTo: authority.effectiveTo,
    },
    validityNote: validityNoteFor(authority),
    foundBy,
    evidence: source === "exact" ? "EXACT_CITATION_VERIFIED" : "SEARCH_MATCH",
  };
}

/** A finding is only reportable when it carries real provenance and quotes text a tool actually returned. */
function isTraceable(authority: ResolvedLegalAuthority): boolean {
  return Boolean(
    authority.nodeId?.trim() &&
      authority.documentId?.trim() &&
      authority.documentVersionId?.trim() &&
      authority.title?.trim() &&
      authority.excerpt?.trim(),
  );
}

function describeConflict(conflict: ConflictFinding): string {
  return `Эх сурвалжуудын хооронд зөрчил байж болзошгүй: ${conflict.explanation}`;
}

export class LegalResearchAgent {
  constructor(private readonly deps: LegalResearchAgentDeps) {}

  async run(input: RunLegalResearchInput): Promise<LegalResearchResult> {
    const question = validateResearchQuestion(input.question);
    const toolTimeoutMs = this.deps.timers?.toolTimeoutMs ?? LEGAL_RESEARCH_LIMITS.TOOL_TIMEOUT_MS;
    const deadlineMs = this.deps.timers?.deadlineMs ?? LEGAL_RESEARCH_LIMITS.DEADLINE_MS;

    // One signal for the whole run: the caller's cancellation OR the overall deadline.
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort();
    if (input.signal?.aborted) controller.abort();
    input.signal?.addEventListener("abort", onCallerAbort, { once: true });
    const deadline = setTimeout(() => controller.abort(), deadlineMs);
    let deadlineHit = false;
    controller.signal.addEventListener("abort", () => {
      deadlineHit = !input.signal?.aborted;
    });

    const uncertainty: string[] = [];
    const limitations: string[] = [];
    const stepRecords: ResearchStepRecord[] = [];
    const findings: ResearchFinding[] = [];
    const seenNodes = new Set<string>();
    let conflicts: ConflictFinding[] = [];
    let droppedFindings = 0;
    let rejectedPlanSteps = 0;
    let toolCalls = 0;
    let stopped: "timeout" | "cancelled" | null = null;
    let usedExternalPlanner = false;

    try {
      if (controller.signal.aborted) throw new RunStopped("cancelled");
      let steps = defaultPlan(question);
      if (this.deps.planner) {
        usedExternalPlanner = true;
        try {
          const raw = await bounded(this.deps.planner.plan(question, controller.signal), toolTimeoutMs, controller.signal);
          const checked = validatePlan(raw);
          rejectedPlanSteps = checked.rejected;
          if (checked.malformed || checked.steps.length === 0) {
            uncertainty.push("Төлөвлөгөөний гаралт буруу хэлбэртэй байсан тул хэрэгжүүлээгүй; тогтмол төлөвлөгөө ашиглав.");
          } else {
            steps = checked.steps;
          }
          if (checked.rejected > 0) {
            uncertainty.push(`Төлөвлөгөөний ${checked.rejected} алхам зөвшөөрөгдөөгүй тул хэрэгжүүлээгүй.`);
          }
        } catch (error) {
          if (error instanceof RunStopped) throw error;
          uncertainty.push("Төлөвлөгөө боловсруулахад алдаа гарсан тул тогтмол төлөвлөгөө ашиглав.");
        }
      }

      for (const step of steps.slice(0, LEGAL_RESEARCH_LIMITS.MAX_STEPS)) {
        // Never START a call once the run is cancelled / past its deadline.
        if (controller.signal.aborted) throw new RunStopped("cancelled");
        toolCalls += 1;
        let resolved: ResolveLegalAuthoritiesResult;
        try {
          resolved = await bounded(
            resolveLegalAuthorities({
              question: step.query,
              retriever: this.deps.retriever,
              requireRetrieval: true,
              graphRepository: this.deps.graphRepository,
            }),
            toolTimeoutMs,
            controller.signal,
          );
        } catch (error) {
          if (error instanceof RunStopped) {
            stepRecords.push({ tool: step.tool, outcome: error.reason, authorityCount: 0 });
            if (error.reason === "timeout") {
              limitations.push("Эх сурвалжаас хариу хугацаандаа ирсэнгүй.");
              continue;
            }
            throw error;
          }
          stepRecords.push({ tool: step.tool, outcome: "error", authorityCount: 0 });
          limitations.push("Эх сурвалж хайх үед алдаа гарлаа.");
          continue;
        }

        if (resolved.kind === "refused") {
          stepRecords.push({ tool: step.tool, outcome: "refused", authorityCount: 0 });
          limitations.push(resolved.message);
          continue;
        }
        if (resolved.kind === "empty") {
          stepRecords.push({ tool: step.tool, outcome: "empty", authorityCount: 0 });
          limitations.push(
            resolved.reason === "unavailable" || resolved.reason === "as_of_unavailable"
              ? "Баталгаатай эх сурвалжид одоогоор хандаж чадсангүй эсвэл тухайн үеийн хувилбарыг баталгаажуулж чадсангүй."
              : "Холбогдох заалт баталгаатай эх сурвалжаас олдсонгүй.",
          );
          continue;
        }
        // lookup_citation means "verify THIS exact citation": a question-search result is not an answer to it.
        if (step.tool === "lookup_citation" && resolved.source !== "exact") {
          stepRecords.push({ tool: step.tool, outcome: "empty", authorityCount: 0 });
          limitations.push("Тодорхой ишлэл олдсонгүй тул баталгаажуулж чадсангүй.");
          continue;
        }

        let accepted = 0;
        for (const authority of resolved.authorities) {
          if (!isTraceable(authority) || seenNodes.has(authority.nodeId)) {
            if (!isTraceable(authority)) droppedFindings += 1;
            continue;
          }
          if (findings.length >= LEGAL_RESEARCH_LIMITS.MAX_FINDINGS) break;
          seenNodes.add(authority.nodeId);
          findings.push(toFinding(authority, step.tool, resolved.source));
          accepted += 1;
        }
        conflicts = conflicts.concat(resolved.conflicts);
        stepRecords.push({ tool: step.tool, outcome: "verified", authorityCount: accepted });
      }
      if (steps.length > LEGAL_RESEARCH_LIMITS.MAX_STEPS) {
        limitations.push("Алхамын дээд хязгаараас хэтэрсэн тул үлдсэн алхмуудыг хэрэгжүүлээгүй.");
      }
    } catch (error) {
      if (error instanceof RunStopped) {
        stopped = deadlineHit && error.reason === "cancelled" ? "timeout" : error.reason;
      } else {
        throw error;
      }
    } finally {
      clearTimeout(deadline);
      input.signal?.removeEventListener("abort", onCallerAbort);
    }

    if (stopped) {
      limitations.push(
        stopped === "timeout"
          ? "Судалгааны нийт хугацаа дууссан тул дуусгаж чадсангүй."
          : "Судалгаа цуцлагдсан.",
      );
    }
    for (const conflict of conflicts) uncertainty.push(describeConflict(conflict));
    for (const finding of findings) {
      if (finding.validityNote) uncertainty.push(`«${finding.title}»: ${finding.validityNote}`);
    }
    if (findings.some((finding) => finding.evidence === "SEARCH_MATCH")) {
      uncertainty.push(
        "Нээлттэй асуултаар олдсон заалтууд нь хайлтын тохирол бөгөөд таны тохиолдолд хамаарах эсэх нь тогтоогдоогүй.",
      );
    }
    if (droppedFindings > 0) {
      uncertainty.push(`${droppedFindings} олдвор эх сурвалжийн мэдээлэл дутуу тул үр дүнд оруулаагүй.`);
    }

    const status: LegalResearchStatus = findings.length > 0 ? "SUPPORTED" : stopped ? "INCOMPLETE" : "NO_VERIFIED_EVIDENCE";
    const summary =
      status === "SUPPORTED"
        ? `Таны асуулттай холбогдох ${findings.length} заалтыг TORE-ийн эх сурвалжийн сангаас (эх сурвалжийн мэдээллийн хамт) олсон. Энэ нь заалтуудын жагсаалт бөгөөд таны тохиолдолд хэрхэн хэрэглэгдэхийг тогтоогоогүй.`
        : status === "INCOMPLETE"
          ? "Судалгаа дуусаагүй тул баталгаатай заалт гаргаж чадсангүй."
          : "Асуулттай холбогдох заалтыг баталгаатай эх сурвалжаас олж чадсангүй. Таамгаар хариулахгүй.";

    return {
      question,
      status,
      summary,
      findings,
      uncertainty,
      limitations,
      nextSteps: status === "SUPPORTED" ? NEXT_STEPS_BASE : NEXT_STEPS_NO_EVIDENCE,
      audit: {
        steps: stepRecords,
        toolCalls,
        rejectedPlanSteps,
        droppedFindings,
        planner: usedExternalPlanner ? "external" : "deterministic",
      },
      disclaimer: LEGAL_RESEARCH_DISCLAIMER,
    };
  }
}
