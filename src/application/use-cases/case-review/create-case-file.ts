import type { ActorContext } from "@/application/common/actor-context";
import type { CaseFile } from "@/domain/entities/case-file";
import { CaseFileAnalysisStatus } from "@/domain/entities/case-file";
import { ConflictError, ValidationError } from "@/domain/errors/domain-error";
import { LegalDomain } from "@/engine/doctrine";

import { assertLawyerReviewer, requireOwnedCaseFile } from "./assert-access";
import type { CaseFileDeps } from "./deps";
import { defaultCaseFileDeps } from "./deps";
import { emptyCaseAnalysisRequest } from "./payload";

const LEGAL_DOMAINS = new Set<string>(Object.values(LegalDomain));

export type CreateCaseFileInput = {
  title: string;
  description?: string | null;
  legalDomain: string;
  applicableAt?: string | null;
};

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function requireTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new ValidationError("Гарчиг шаардлагатай.");
  }
  return trimmed;
}

function requireDomain(domain: string): string {
  const trimmed = domain.trim();
  if (!LEGAL_DOMAINS.has(trimmed)) {
    throw new ValidationError("Эрх зүйн салбар буруу байна.");
  }
  return trimmed;
}

function requireApplicableAt(value: string | null | undefined): string {
  const trimmed = (value ?? todayIsoDate()).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    throw new ValidationError("Хэрэглэх огноо ISO форматтай байх ёстой.");
  }
  return trimmed.slice(0, 10);
}

export async function createCaseFileForLawyer(
  actor: ActorContext,
  input: CreateCaseFileInput,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseFile> {
  assertLawyerReviewer(actor);
  const applicableAt = requireApplicableAt(input.applicableAt);
  return deps.repository.create({
    ownerLawyerId: actor.userId,
    title: requireTitle(input.title),
    description: input.description?.trim() ? input.description.trim() : null,
    legalDomain: requireDomain(input.legalDomain),
    applicableAt,
    request: emptyCaseAnalysisRequest(applicableAt),
    review: null,
    mappingLog: [],
    fixtureRules: null,
    analysisStatus: CaseFileAnalysisStatus.NOT_ANALYZED,
    lastAnalyzedAt: null,
    lastAnalysisError: null,
  });
}

export type UpdateCaseFileInput = {
  caseId: string;
  expectedVersion: number;
  title?: string;
  description?: string | null;
  legalDomain?: string;
  applicableAt?: string | null;
};

export async function updateCaseFileForLawyer(
  actor: ActorContext,
  input: UpdateCaseFileInput,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseFile> {
  const file = await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new ValidationError("Хэргийн одоогийн хувилбар шаардлагатай.");
  }
  const nextRequest = { ...file.request };
  const patch: Parameters<CaseFileDeps["repository"]["updateIfVersionMatch"]>[2] =
    {};
  if (input.title !== undefined) patch.title = requireTitle(input.title);
  if (input.description !== undefined) {
    patch.description = input.description?.trim()
      ? input.description.trim()
      : null;
  }
  if (input.legalDomain !== undefined) {
    patch.legalDomain = requireDomain(input.legalDomain);
  }
  if (input.applicableAt !== undefined) {
    const applicableAt = requireApplicableAt(input.applicableAt);
    patch.applicableAt = applicableAt;
    nextRequest.applicableAt = applicableAt;
    patch.request = nextRequest;
  }
  const updated = await deps.repository.updateIfVersionMatch(
    file.id,
    input.expectedVersion,
    patch,
  );
  if (updated) return updated;
  throw new ConflictError("Хэргийг өөр сессэд шинэчилсэн байна.");
}
