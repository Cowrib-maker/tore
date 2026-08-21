import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  CaseEvidenceRecord,
  CaseFact,
  CaseFactEvidenceLink,
  CaseFile,
  CaseFilePatch,
  CreateCaseFileInput,
  ManualMappingLogEntry,
} from "@/domain/entities/case-file";
import type { CaseFileRepository } from "@/domain/repositories/case-file-repository";
import type {
  CaseAnalysisRequest,
  CaseAnalysisReview,
  RetrievedLegalRule,
} from "@/engine/doctrine";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

const intakeInclude = {
  facts: {
    orderBy: { createdAt: "asc" as const },
    include: { links: true },
  },
  evidence: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.CaseFileInclude;

type CaseFileRow = Prisma.CaseFileGetPayload<{ include: typeof intakeInclude }>;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapLinks(row: CaseFileRow): CaseFactEvidenceLink[] {
  return row.facts.flatMap((fact) =>
    fact.links.map((link) => ({
      factId: link.caseFactId,
      evidenceId: link.caseEvidenceId,
      createdByUserId: link.createdByUserId,
      createdAt: link.createdAt,
    })),
  );
}

function mapCaseFile(row: CaseFileRow): CaseFile {
  return {
    id: row.id,
    ownerLawyerId: row.ownerLawyerId,
    title: row.title,
    description: row.description,
    legalDomain: row.legalDomain,
    version: row.version,
    applicableAt: row.applicableAt,
    request: row.requestJson as unknown as CaseAnalysisRequest,
    review: (row.reviewJson as unknown as CaseAnalysisReview | null) ?? null,
    mappingLog: (row.mappingLogJson as unknown as ManualMappingLogEntry[]) ?? [],
    fixtureRules:
      (row.fixtureRulesJson as unknown as RetrievedLegalRule[] | null) ?? null,
    analysisStatus: row.analysisStatus,
    lastAnalyzedAt: row.lastAnalyzedAt,
    lastAnalysisError: row.lastAnalysisError,
    facts: row.facts.map((fact) => ({
      id: fact.id,
      caseFileId: fact.caseFileId,
      text: fact.text,
      sourceType: fact.sourceType,
      sourceReference: fact.sourceReference,
      createdByUserId: fact.createdByUserId,
      updatedByUserId: fact.updatedByUserId,
      createdAt: fact.createdAt,
      updatedAt: fact.updatedAt,
    })),
    evidence: row.evidence.map((item) => ({
      id: item.id,
      caseFileId: item.caseFileId,
      title: item.title,
      description: item.description,
      evidenceType: item.evidenceType,
      fileReference: item.fileReference,
      sourceReference: item.sourceReference,
      createdByUserId: item.createdByUserId,
      updatedByUserId: item.updatedByUserId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    factEvidenceLinks: mapLinks(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function replaceIntake(
  db: PrismaDbClient,
  caseFileId: string,
  facts: CaseFact[],
  evidence: CaseEvidenceRecord[],
  links: CaseFactEvidenceLink[],
): Promise<void> {
  await db.caseFactEvidence.deleteMany({
    where: { fact: { caseFileId } },
  });
  await db.caseFact.deleteMany({ where: { caseFileId } });
  await db.caseEvidence.deleteMany({ where: { caseFileId } });

  if (facts.length > 0) {
    await db.caseFact.createMany({
      data: facts.map((fact) => ({
        id: fact.id,
        caseFileId,
        text: fact.text,
        sourceType: fact.sourceType,
        sourceReference: fact.sourceReference,
        createdByUserId: fact.createdByUserId,
        updatedByUserId: fact.updatedByUserId,
        createdAt: fact.createdAt,
        updatedAt: fact.updatedAt,
      })),
    });
  }
  if (evidence.length > 0) {
    await db.caseEvidence.createMany({
      data: evidence.map((item) => ({
        id: item.id,
        caseFileId,
        title: item.title,
        description: item.description,
        evidenceType: item.evidenceType,
        fileReference: item.fileReference,
        sourceReference: item.sourceReference,
        createdByUserId: item.createdByUserId,
        updatedByUserId: item.updatedByUserId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    });
  }
  if (links.length > 0) {
    await db.caseFactEvidence.createMany({
      data: links.map((link) => ({
        caseFactId: link.factId,
        caseEvidenceId: link.evidenceId,
        createdByUserId: link.createdByUserId,
        createdAt: link.createdAt,
      })),
    });
  }
}

function patchData(patch: CaseFilePatch): Prisma.CaseFileUpdateInput {
  const data: Prisma.CaseFileUpdateInput = {
    version: { increment: 1 },
  };
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.legalDomain !== undefined) data.legalDomain = patch.legalDomain;
  if (patch.applicableAt !== undefined) data.applicableAt = patch.applicableAt;
  if (patch.request !== undefined) data.requestJson = asJson(patch.request);
  if (patch.review !== undefined) {
    data.reviewJson = patch.review ? asJson(patch.review) : Prisma.JsonNull;
  }
  if (patch.mappingLog !== undefined) {
    data.mappingLogJson = asJson(patch.mappingLog);
  }
  if (patch.fixtureRules !== undefined) {
    data.fixtureRulesJson = patch.fixtureRules
      ? asJson(patch.fixtureRules)
      : Prisma.JsonNull;
  }
  if (patch.analysisStatus !== undefined) {
    data.analysisStatus = patch.analysisStatus;
  }
  if (patch.lastAnalyzedAt !== undefined) {
    data.lastAnalyzedAt = patch.lastAnalyzedAt;
  }
  if (patch.lastAnalysisError !== undefined) {
    data.lastAnalysisError = patch.lastAnalysisError;
  }
  return data;
}

export class PrismaCaseFileRepository implements CaseFileRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async create(input: CreateCaseFileInput): Promise<CaseFile> {
    const row = await this.withTransaction(async (db) => {
      const created = await db.caseFile.create({
        data: {
          ownerLawyerId: input.ownerLawyerId,
          title: input.title,
          description: input.description,
          legalDomain: input.legalDomain,
          applicableAt: input.applicableAt,
          requestJson: asJson(input.request),
          reviewJson: input.review ? asJson(input.review) : undefined,
          mappingLogJson: asJson(input.mappingLog ?? []),
          fixtureRulesJson: input.fixtureRules
            ? asJson(input.fixtureRules)
            : undefined,
          analysisStatus: input.analysisStatus ?? "NOT_ANALYZED",
          lastAnalyzedAt: input.lastAnalyzedAt ?? null,
          lastAnalysisError: input.lastAnalysisError ?? null,
        },
      });
      await replaceIntake(
        db,
        created.id,
        (input.facts ?? []).map((fact) => ({ ...fact, caseFileId: created.id })),
        (input.evidence ?? []).map((item) => ({
          ...item,
          caseFileId: created.id,
        })),
        input.factEvidenceLinks ?? [],
      );
      return db.caseFile.findUniqueOrThrow({
        where: { id: created.id },
        include: intakeInclude,
      });
    });
    return mapCaseFile(row);
  }

  async findById(id: string): Promise<CaseFile | null> {
    const row = await this.db.caseFile.findUnique({
      where: { id },
      include: intakeInclude,
    });
    return row ? mapCaseFile(row) : null;
  }

  async listByOwnerLawyerId(ownerLawyerId: string): Promise<CaseFile[]> {
    const rows = await this.db.caseFile.findMany({
      where: { ownerLawyerId },
      orderBy: { updatedAt: "desc" },
      include: intakeInclude,
    });
    return rows.map(mapCaseFile);
  }

  async updateIfVersionMatch(
    id: string,
    expectedVersion: number,
    patch: CaseFilePatch,
  ): Promise<CaseFile | null> {
    return this.withTransaction(async (db) => {
      const result = await db.caseFile.updateMany({
        where: { id, version: expectedVersion },
        data: patchData(patch),
      });
      if (result.count === 0) {
        return null;
      }
      const replaceIntakeCollections =
        patch.facts !== undefined ||
        patch.evidence !== undefined ||
        patch.factEvidenceLinks !== undefined;
      if (replaceIntakeCollections) {
        await replaceIntake(
          db,
          id,
          patch.facts ?? [],
          patch.evidence ?? [],
          patch.factEvidenceLinks ?? [],
        );
      }
      const row = await db.caseFile.findUniqueOrThrow({
        where: { id },
        include: intakeInclude,
      });
      return mapCaseFile(row);
    });
  }

  private async withTransaction<T>(
    fn: (db: PrismaDbClient) => Promise<T>,
  ): Promise<T> {
    if (this.canStartTransaction(this.db)) {
      return this.db.$transaction(async (tx) => fn(tx));
    }
    return fn(this.db);
  }

  private canStartTransaction(db: PrismaDbClient): db is PrismaClient {
    return typeof (db as PrismaClient).$transaction === "function";
  }
}

export const caseFileRepository = new PrismaCaseFileRepository();
