import { randomUUID } from "node:crypto";

import type { ActorContext } from "@/application/common/actor-context";
import type {
  CaseEvidenceRecord,
  CaseFact,
  CaseFactEvidenceLink,
  CaseFile,
} from "@/domain/entities/case-file";
import {
  CaseEvidenceType,
  CaseFactSourceType,
  EVIDENCE_DESCRIPTION_MAX,
  EVIDENCE_TITLE_MAX,
  FACT_TEXT_MAX,
} from "@/domain/entities/case-file";
import { ConflictError, ValidationError } from "@/domain/errors/domain-error";
import type { CaseReviewWorkspacePayload } from "@/engine/doctrine";

import { requireOwnedCaseFile } from "./assert-access";
import type { CaseFileDeps } from "./deps";
import { defaultCaseFileDeps } from "./deps";
import { toWorkspacePayload } from "./payload";
import { syncAnalysisRequestFromIntake } from "./sync-request";

const SOURCE_TYPES = new Set<string>(Object.values(CaseFactSourceType));
const EVIDENCE_TYPES = new Set<string>(Object.values(CaseEvidenceType));

function requireExpectedVersion(expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new ValidationError("Хэргийн одоогийн хувилбар шаардлагатай.");
  }
}

function requireFactText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new ValidationError("Нөхцөл байдлын текст шаардлагатай.");
  }
  if (trimmed.length > FACT_TEXT_MAX) {
    throw new ValidationError(
      `Нөхцөл байдлын текст хамгийн ихдээ ${FACT_TEXT_MAX} тэмдэгт байна.`,
    );
  }
  return trimmed;
}

function requireSourceType(value: string | null | undefined): string {
  const trimmed = (value ?? CaseFactSourceType.MANUAL).trim();
  if (!SOURCE_TYPES.has(trimmed)) {
    throw new ValidationError("Эх сурвалжийн төрөл буруу байна.");
  }
  return trimmed;
}

function optionalReference(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function requireEvidenceTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new ValidationError("Баримтын гарчиг шаардлагатай.");
  }
  if (trimmed.length > EVIDENCE_TITLE_MAX) {
    throw new ValidationError(
      `Баримтын гарчиг хамгийн ихдээ ${EVIDENCE_TITLE_MAX} тэмдэгт байна.`,
    );
  }
  return trimmed;
}

function optionalDescription(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ? value.trim() : null;
  if (trimmed && trimmed.length > EVIDENCE_DESCRIPTION_MAX) {
    throw new ValidationError(
      `Баримтын тайлбар хамгийн ихдээ ${EVIDENCE_DESCRIPTION_MAX} тэмдэгт байна.`,
    );
  }
  return trimmed;
}

function requireEvidenceType(value: string): string {
  const trimmed = value.trim();
  if (!EVIDENCE_TYPES.has(trimmed)) {
    throw new ValidationError("Баримтын төрөл буруу байна.");
  }
  return trimmed;
}

async function persistIntake(
  file: CaseFile,
  expectedVersion: number,
  next: {
    facts: CaseFact[];
    evidence: CaseEvidenceRecord[];
    factEvidenceLinks: CaseFactEvidenceLink[];
  },
  deps: CaseFileDeps,
): Promise<CaseFile> {
  const request = syncAnalysisRequestFromIntake({
    request: file.request,
    facts: next.facts,
    evidence: next.evidence,
    factEvidenceLinks: next.factEvidenceLinks,
  });
  const updated = await deps.repository.updateIfVersionMatch(
    file.id,
    expectedVersion,
    {
      request,
      facts: next.facts,
      evidence: next.evidence,
      factEvidenceLinks: next.factEvidenceLinks,
    },
  );
  if (!updated) {
    throw new ConflictError("Хэргийг өөр сессэд шинэчилсэн байна.");
  }
  return updated;
}

export type CreateCaseFactInput = {
  caseId: string;
  expectedVersion: number;
  text: string;
  sourceType?: string;
  sourceReference?: string | null;
};

export async function createCaseFactForLawyer(
  actor: ActorContext,
  input: CreateCaseFactInput,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseReviewWorkspacePayload> {
  const file = await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  requireExpectedVersion(input.expectedVersion);
  const now = new Date();
  const fact: CaseFact = {
    id: randomUUID(),
    caseFileId: file.id,
    text: requireFactText(input.text),
    sourceType: requireSourceType(input.sourceType),
    sourceReference: optionalReference(input.sourceReference),
    createdByUserId: actor.userId,
    updatedByUserId: actor.userId,
    createdAt: now,
    updatedAt: now,
  };
  const updated = await persistIntake(
    file,
    input.expectedVersion,
    {
      facts: [...file.facts, fact],
      evidence: file.evidence,
      factEvidenceLinks: file.factEvidenceLinks,
    },
    deps,
  );
  return toWorkspacePayload(updated);
}

export type UpdateCaseFactInput = {
  caseId: string;
  expectedVersion: number;
  factId: string;
  text?: string;
  sourceType?: string;
  sourceReference?: string | null;
};

export async function updateCaseFactForLawyer(
  actor: ActorContext,
  input: UpdateCaseFactInput,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseReviewWorkspacePayload> {
  const file = await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  requireExpectedVersion(input.expectedVersion);
  const current = file.facts.find((fact) => fact.id === input.factId);
  if (!current) {
    throw new ValidationError("Үл мэдэгдэх нөхцөл байдал.");
  }
  const facts = file.facts.map((fact) =>
    fact.id === current.id
      ? {
          ...fact,
          text: input.text !== undefined ? requireFactText(input.text) : fact.text,
          sourceType:
            input.sourceType !== undefined
              ? requireSourceType(input.sourceType)
              : fact.sourceType,
          sourceReference:
            input.sourceReference !== undefined
              ? optionalReference(input.sourceReference)
              : fact.sourceReference,
          updatedByUserId: actor.userId,
          updatedAt: new Date(),
        }
      : fact,
  );
  const updated = await persistIntake(
    file,
    input.expectedVersion,
    {
      facts,
      evidence: file.evidence,
      factEvidenceLinks: file.factEvidenceLinks,
    },
    deps,
  );
  return toWorkspacePayload(updated);
}

export type DeleteCaseFactInput = {
  caseId: string;
  expectedVersion: number;
  factId: string;
};

export async function deleteCaseFactForLawyer(
  actor: ActorContext,
  input: DeleteCaseFactInput,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseReviewWorkspacePayload> {
  const file = await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  requireExpectedVersion(input.expectedVersion);
  if (!file.facts.some((fact) => fact.id === input.factId)) {
    throw new ValidationError("Үл мэдэгдэх нөхцөл байдал.");
  }
  const updated = await persistIntake(
    file,
    input.expectedVersion,
    {
      facts: file.facts.filter((fact) => fact.id !== input.factId),
      evidence: file.evidence,
      factEvidenceLinks: file.factEvidenceLinks.filter(
        (link) => link.factId !== input.factId,
      ),
    },
    deps,
  );
  return toWorkspacePayload(updated);
}

export type CreateCaseEvidenceInput = {
  caseId: string;
  expectedVersion: number;
  title: string;
  description?: string | null;
  evidenceType: string;
  fileReference?: string | null;
  sourceReference?: string | null;
};

export async function createCaseEvidenceForLawyer(
  actor: ActorContext,
  input: CreateCaseEvidenceInput,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseReviewWorkspacePayload> {
  const file = await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  requireExpectedVersion(input.expectedVersion);
  const now = new Date();
  const evidence: CaseEvidenceRecord = {
    id: randomUUID(),
    caseFileId: file.id,
    title: requireEvidenceTitle(input.title),
    description: optionalDescription(input.description),
    evidenceType: requireEvidenceType(input.evidenceType),
    fileReference: optionalReference(input.fileReference),
    sourceReference: optionalReference(input.sourceReference),
    createdByUserId: actor.userId,
    updatedByUserId: actor.userId,
    createdAt: now,
    updatedAt: now,
  };
  const updated = await persistIntake(
    file,
    input.expectedVersion,
    {
      facts: file.facts,
      evidence: [...file.evidence, evidence],
      factEvidenceLinks: file.factEvidenceLinks,
    },
    deps,
  );
  return toWorkspacePayload(updated);
}

export type UpdateCaseEvidenceInput = {
  caseId: string;
  expectedVersion: number;
  evidenceId: string;
  title?: string;
  description?: string | null;
  evidenceType?: string;
  fileReference?: string | null;
  sourceReference?: string | null;
};

export async function updateCaseEvidenceForLawyer(
  actor: ActorContext,
  input: UpdateCaseEvidenceInput,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseReviewWorkspacePayload> {
  const file = await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  requireExpectedVersion(input.expectedVersion);
  const current = file.evidence.find((item) => item.id === input.evidenceId);
  if (!current) {
    throw new ValidationError("Үл мэдэгдэх нотлох баримт.");
  }
  const evidence = file.evidence.map((item) =>
    item.id === current.id
      ? {
          ...item,
          title:
            input.title !== undefined
              ? requireEvidenceTitle(input.title)
              : item.title,
          description:
            input.description !== undefined
              ? optionalDescription(input.description)
              : item.description,
          evidenceType:
            input.evidenceType !== undefined
              ? requireEvidenceType(input.evidenceType)
              : item.evidenceType,
          fileReference:
            input.fileReference !== undefined
              ? optionalReference(input.fileReference)
              : item.fileReference,
          sourceReference:
            input.sourceReference !== undefined
              ? optionalReference(input.sourceReference)
              : item.sourceReference,
          updatedByUserId: actor.userId,
          updatedAt: new Date(),
        }
      : item,
  );
  const updated = await persistIntake(
    file,
    input.expectedVersion,
    {
      facts: file.facts,
      evidence,
      factEvidenceLinks: file.factEvidenceLinks,
    },
    deps,
  );
  return toWorkspacePayload(updated);
}

export type DeleteCaseEvidenceInput = {
  caseId: string;
  expectedVersion: number;
  evidenceId: string;
};

export async function deleteCaseEvidenceForLawyer(
  actor: ActorContext,
  input: DeleteCaseEvidenceInput,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseReviewWorkspacePayload> {
  const file = await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  requireExpectedVersion(input.expectedVersion);
  if (!file.evidence.some((item) => item.id === input.evidenceId)) {
    throw new ValidationError("Үл мэдэгдэх нотлох баримт.");
  }
  const updated = await persistIntake(
    file,
    input.expectedVersion,
    {
      facts: file.facts,
      evidence: file.evidence.filter((item) => item.id !== input.evidenceId),
      factEvidenceLinks: file.factEvidenceLinks.filter(
        (link) => link.evidenceId !== input.evidenceId,
      ),
    },
    deps,
  );
  return toWorkspacePayload(updated);
}

export type LinkCaseFactEvidenceInput = {
  caseId: string;
  expectedVersion: number;
  factId: string;
  evidenceId: string;
};

export async function linkCaseFactEvidenceForLawyer(
  actor: ActorContext,
  input: LinkCaseFactEvidenceInput,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseReviewWorkspacePayload> {
  const file = await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  requireExpectedVersion(input.expectedVersion);
  if (!file.facts.some((fact) => fact.id === input.factId)) {
    throw new ValidationError("Үл мэдэгдэх нөхцөл байдал.");
  }
  if (!file.evidence.some((item) => item.id === input.evidenceId)) {
    throw new ValidationError("Үл мэдэгдэх нотлох баримт.");
  }
  const alreadyLinked = file.factEvidenceLinks.some(
    (link) =>
      link.factId === input.factId && link.evidenceId === input.evidenceId,
  );
  if (alreadyLinked) {
    return toWorkspacePayload(file);
  }
  const updated = await persistIntake(
    file,
    input.expectedVersion,
    {
      facts: file.facts,
      evidence: file.evidence,
      factEvidenceLinks: [
        ...file.factEvidenceLinks,
        {
          factId: input.factId,
          evidenceId: input.evidenceId,
          createdByUserId: actor.userId,
          createdAt: new Date(),
        },
      ],
    },
    deps,
  );
  return toWorkspacePayload(updated);
}

export async function unlinkCaseFactEvidenceForLawyer(
  actor: ActorContext,
  input: LinkCaseFactEvidenceInput,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseReviewWorkspacePayload> {
  const file = await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  requireExpectedVersion(input.expectedVersion);
  const exists = file.factEvidenceLinks.some(
    (link) =>
      link.factId === input.factId && link.evidenceId === input.evidenceId,
  );
  if (!exists) {
    throw new ValidationError("Үл мэдэгдэх холбоос.");
  }
  const updated = await persistIntake(
    file,
    input.expectedVersion,
    {
      facts: file.facts,
      evidence: file.evidence,
      factEvidenceLinks: file.factEvidenceLinks.filter(
        (link) =>
          !(
            link.factId === input.factId &&
            link.evidenceId === input.evidenceId
          ),
      ),
    },
    deps,
  );
  return toWorkspacePayload(updated);
}
