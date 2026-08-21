import type {
  CaseEvidenceRecord,
  CaseFact,
  CaseFactEvidenceLink,
  CaseFile,
} from "@/domain/entities/case-file";
import type {
  CaseAnalysisRequest,
  LegalEvidence,
  LegalFact,
} from "@/engine/doctrine";

/**
 * Rebuilds engine facts/evidence from intake records.
 * Preserves existing MANUAL/explicit mappings; never invents new ones.
 */
export function syncAnalysisRequestFromIntake(file: {
  request: CaseAnalysisRequest;
  facts: CaseFact[];
  evidence: CaseEvidenceRecord[];
  factEvidenceLinks: CaseFactEvidenceLink[];
}): CaseAnalysisRequest {
  const factIds = new Set(file.facts.map((fact) => fact.id));
  const evidenceById = new Map(file.evidence.map((item) => [item.id, item]));
  const linkedEvidenceIds = new Set(
    file.factEvidenceLinks.map((link) => `${link.factId}::${link.evidenceId}`),
  );

  const facts: LegalFact[] = file.facts.map((fact) => {
    const existing = file.request.facts.find((row) => row.id === fact.id);
    return {
      id: fact.id,
      statement: fact.text,
      elementId: existing?.elementId ?? null,
      elementIds: existing?.elementIds,
      disputed: existing?.disputed ?? false,
      mappingRelation: existing?.mappingRelation,
      mappingMethod: existing?.mappingMethod,
    };
  });

  const evidence: LegalEvidence[] = [];
  for (const link of file.factEvidenceLinks) {
    if (!factIds.has(link.factId)) continue;
    const record = evidenceById.get(link.evidenceId);
    if (!record) continue;
    evidence.push({
      id: record.id,
      factId: link.factId,
      description: record.description?.trim()
        ? `${record.title} — ${record.description}`
        : record.title,
      sourceId: record.sourceReference ?? record.fileReference,
    });
  }

  const mappings = (file.request.mappings ?? [])
    .filter((mapping) => factIds.has(mapping.factId))
    .map((mapping) => ({
      ...mapping,
      evidenceIds: mapping.evidenceIds?.filter((evidenceId) =>
        linkedEvidenceIds.has(`${mapping.factId}::${evidenceId}`),
      ),
    }));

  return {
    ...file.request,
    facts,
    evidence,
    mappings,
  };
}

export function intakeFromAnalysisRequest(
  caseFileId: string,
  request: CaseAnalysisRequest,
  actorUserId: string,
  now = new Date(),
): {
  facts: CaseFact[];
  evidence: CaseEvidenceRecord[];
  factEvidenceLinks: CaseFactEvidenceLink[];
} {
  const facts: CaseFact[] = request.facts.map((fact) => ({
    id: fact.id,
    caseFileId,
    text: fact.statement,
    sourceType: "SYSTEM",
    sourceReference: null,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    createdAt: now,
    updatedAt: now,
  }));

  const evidenceById = new Map<string, CaseEvidenceRecord>();
  const factEvidenceLinks: CaseFactEvidenceLink[] = [];
  for (const item of request.evidence) {
    if (!evidenceById.has(item.id)) {
      evidenceById.set(item.id, {
        id: item.id,
        caseFileId,
        title: item.description,
        description: null,
        evidenceType: "RECORD",
        fileReference: null,
        sourceReference: item.sourceId,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        createdAt: now,
        updatedAt: now,
      });
    }
    factEvidenceLinks.push({
      factId: item.factId,
      evidenceId: item.id,
      createdByUserId: actorUserId,
      createdAt: now,
    });
  }

  return {
    facts,
    evidence: [...evidenceById.values()],
    factEvidenceLinks,
  };
}
