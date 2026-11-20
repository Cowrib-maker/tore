/**
 * Reference grounding for the administrative written-exam problem —
 * proves, by actually running the real source-backed doctrine pipeline
 * (`analyzeAdministrativeCase`, unmodified), that a faithful reading of
 * the case's own fact pattern is admissible and reaches the expected
 * per-element result on the combined LegalTest.
 *
 * This is NOT part of the student grading path (the student's own answer
 * is graded via AiFactElementMapper + DefaultSubsumptionEngine directly —
 * see submit-written-attempt.ts) and its result is never shown to the
 * student verbatim. It exists so requirement #8 ("use
 * analyzeAdministrativeCase()... the source-backed doctrine is the answer
 * key") is exercised for real, and so the fixture-level reference facts
 * below are checked against the live engine rather than merely asserted.
 *
 * Reference facts intentionally do NOT cover every one of the 19 combined
 * elements: the case-study fact pattern is short and only speaks to some
 * of them (hearing omitted, grounds unstated, the rest of the formal/
 * substantive detail is simply not in the story). Elements the story is
 * silent on are left unmapped — NOT_EVALUATED — rather than invented.
 */
import {
  EmptyCivilDoctrineFramework,
  EmptyCriminalDoctrineFramework,
  EmptyRuleRetriever,
  FactElementRelation,
  RuleBasedIssueSpotter,
  RuleBasedLegalDomainClassifier,
  SourceBackedAdministrativeDoctrineFramework,
  analyzeAdministrativeCase,
  createCaseAnalysisOrchestrator,
  type AdministrativeCaseAnalysisResult,
} from "@/engine/doctrine";
import type { LegalEvidence, LegalFact } from "@/engine/doctrine";
import { buildAdministrativeMeritsLegalTest } from "@/domain/student/administrative-written-exam";

export const REFERENCE_APPLICABLE_AT = "2024-01-01";

function fact(id: string, statement: string, elementId: string, negates = false): LegalFact {
  return {
    id,
    statement,
    elementId,
    disputed: false,
    mappingRelation: negates ? FactElementRelation.NEGATES : FactElementRelation.SUPPORTS,
  };
}

function evidence(id: string, factId: string, description: string): LegalEvidence {
  return { id, factId, description, sourceId: null };
}

export const ADMINISTRATIVE_WRITTEN_EXAM_ADMISSIBILITY_FACTS: LegalFact[] = [
  fact(
    "j:adm:1.1",
    "Ж-ийн худалдааны зөвшөөрлийг цуцалснаар түүний эрх, ашиг сонирхолд шууд сөрөг эрх зүйн үр дагавар үүссэн.",
    "administrative:admissibility:1.1-legal-dispute",
  ),
  fact(
    "j:adm:1.2",
    "Худалдааны зөвшөөрөл олгох, цуцлах харилцааг нийтийн эрх зүйн хэм хэмжээ зохицуулна.",
    "administrative:admissibility:1.2-public-law-dispute",
  ),
  fact(
    "j:adm:1.3",
    "Маргаан нь Үндсэн хуулийн цэцийн харьяалах маргаанд хамаарахгүй.",
    "administrative:admissibility:1.3-not-constitutional-court",
  ),
  fact(
    "j:adm:1.4",
    "Маргаан нь эрүүгийн, иргэний харьяалалд хамаарахгүй — захиргааны хэргийн шүүхийн харьяалал.",
    "administrative:admissibility:1.4-not-other-court",
  ),
];

export const ADMINISTRATIVE_WRITTEN_EXAM_MERITS_FACTS: LegalFact[] = [
  fact(
    "j:act:1",
    "Шийдвэрийг орон нутгийн засаг захиргааны байгууллага гаргасан.",
    "administrative:act:1-issuing-body",
  ),
  fact(
    "j:act:2",
    "Шийдвэр Ж-д чиглэсэн, тодорхой нэг тохиолдлыг зохицуулсан.",
    "administrative:act:2-definite-occasion",
  ),
  fact(
    "j:act:4",
    "Шийдвэрийн үйлчлэл Ж-ийн худалдаа эрхлэх эрхэд чиглэсэн — гадагш чиглэсэн.",
    "administrative:act:4-outward-facing",
  ),
  fact(
    "j:act:5",
    "Зөвшөөрлийг цуцалснаар Ж-ийн худалдаа эрхлэх эрх дуусгавар болсон — шууд эрх зүйн үр дагавар.",
    "administrative:act:5-direct-legal-effect",
  ),
  fact(
    "j:act:6",
    "Шийдвэр нь байгууллагын нэг талын хүсэл зоригийг илэрхийлсэн, захирамжилсан шинжтэй.",
    "administrative:act:6-directive-measure",
  ),
  fact(
    "j:formal:procedure",
    "Зөвшөөрлийг сонсгол хийлгүйгээр цуцалсан тул шийдвэр гаргах журмын дагуу оролцогчийн саналыг сонссонгүй.",
    "administrative:formal:2-decision-procedure",
    true,
  ),
  fact(
    "j:subst:clarity",
    "Шийдвэрт цуцлах үндэслэлийг тодорхой бичээгүй тул шийдвэрийн агуулга ойлгомжгүй.",
    "administrative:substantive:2-content-clarity",
    true,
  ),
];

export const ADMINISTRATIVE_WRITTEN_EXAM_ADMISSIBILITY_EVIDENCE: LegalEvidence[] = [
  evidence("j:adm:1.1:ev", "j:adm:1.1", "Худалдааны зөвшөөрөл цуцлах шийдвэр"),
  evidence("j:adm:1.2:ev", "j:adm:1.2", "Худалдааны зөвшөөрлийн тухай хууль тогтоомж"),
  evidence("j:adm:1.3:ev", "j:adm:1.3", "Vндсэн хуулийн цэцийн харьяаллын хvрээ"),
  evidence("j:adm:1.4:ev", "j:adm:1.4", "Захиргааны хэргийн шvvхийн харьяаллын хvрээ"),
];

export const ADMINISTRATIVE_WRITTEN_EXAM_MERITS_EVIDENCE: LegalEvidence[] = [
  evidence("j:act:1:ev", "j:act:1", "Шийдвэрийг гаргасан байгууллагын нэр"),
  evidence("j:act:2:ev", "j:act:2", "Шийдвэрийн хаяглагдсан этгээд"),
  evidence("j:act:4:ev", "j:act:4", "Шийдвэрийн vйлчлэлийн чиглэл"),
  evidence("j:act:5:ev", "j:act:5", "Зөвшөөрөл цуцлагдсан баримт"),
  evidence("j:act:6:ev", "j:act:6", "Шийдвэрийн захирамжилсан шинж"),
  evidence("j:formal:procedure:ev", "j:formal:procedure", "Сонсгол хийгдээгvй тухай баримт"),
  evidence("j:subst:clarity:ev", "j:subst:clarity", "Шийдвэрийн бичвэрт vндэслэл байхгvй"),
];

function buildOrchestrator() {
  const classifier = new RuleBasedLegalDomainClassifier();
  return createCaseAnalysisOrchestrator({
    issueSpotter: new RuleBasedIssueSpotter(classifier),
    ruleRetriever: new EmptyRuleRetriever(),
    classifier,
    criminalFramework: new EmptyCriminalDoctrineFramework(),
    civilFramework: new EmptyCivilDoctrineFramework(),
    administrativeFramework: new SourceBackedAdministrativeDoctrineFramework(),
  });
}

/**
 * Runs the reference fact pattern through the real, unmodified
 * `analyzeAdministrativeCase` pipeline. Used only as internal grounding /
 * a consistency check between the written-exam fixture and the live
 * doctrine engine (see tests) — never surfaced verbatim to a student.
 */
export async function groundAdministrativeWrittenExamReference(): Promise<AdministrativeCaseAnalysisResult> {
  const orchestrator = buildOrchestrator();
  return analyzeAdministrativeCase(
    {
      facts: ADMINISTRATIVE_WRITTEN_EXAM_ADMISSIBILITY_FACTS,
      evidence: ADMINISTRATIVE_WRITTEN_EXAM_ADMISSIBILITY_EVIDENCE,
      applicableAt: REFERENCE_APPLICABLE_AT,
      merits: {
        facts: ADMINISTRATIVE_WRITTEN_EXAM_MERITS_FACTS,
        evidence: ADMINISTRATIVE_WRITTEN_EXAM_MERITS_EVIDENCE,
        applicableAt: REFERENCE_APPLICABLE_AT,
        legalTest: buildAdministrativeMeritsLegalTest(),
      },
    },
    orchestrator,
  );
}
