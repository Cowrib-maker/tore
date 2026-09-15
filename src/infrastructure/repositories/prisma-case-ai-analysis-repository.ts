import { Prisma } from "@/generated/prisma/client";
import {
  CaseAiAnalysisStatus,
  type CaseAiAnalysisResult,
  type CaseAiCitation,
  type CaseAiCitationType,
} from "@/domain/entities/case-ai-analysis";
import type {
  CaseAiAnalysisRepository,
  CreateCaseAiAnalysisInput,
} from "@/domain/repositories/case-ai-analysis-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

const analysisInclude = {
  citations: { orderBy: { id: "asc" as const } },
} satisfies Prisma.CaseAiAnalysisInclude;

type AnalysisRow = Prisma.CaseAiAnalysisGetPayload<{
  include: typeof analysisInclude;
}>;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapRow(row: AnalysisRow): CaseAiAnalysisResult {
  return {
    id: row.id,
    caseFileId: row.caseFileId,
    status: row.status as CaseAiAnalysisResult["status"],
    sections:
      row.sections != null
        ? (row.sections as unknown as CaseAiAnalysisResult["sections"])
        : null,
    citations: row.citations.map(
      (citation): CaseAiCitation => ({
        citationType: citation.citationType as CaseAiCitationType,
        title: citation.title,
        reference: citation.reference,
        excerpt: citation.excerpt,
        sourceUrl: citation.sourceUrl,
        sourceType: citation.sourceType,
        documentId: citation.documentId,
        documentVersionId: citation.documentVersionId,
        nodeId: citation.nodeId,
        caseEvidenceId: citation.caseEvidenceId,
      }),
    ),
    provider: row.provider,
    model: row.model,
    failureReason: row.failureReason,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

export class PrismaCaseAiAnalysisRepository implements CaseAiAnalysisRepository {
  constructor(private readonly client?: PrismaDbClient) {}

  async create(
    input: CreateCaseAiAnalysisInput,
  ): Promise<CaseAiAnalysisResult> {
    const db = getPrismaClient(this.client);
    const row = await db.caseAiAnalysis.create({
      data:
        input.status === "OK"
          ? {
              caseFileId: input.caseFileId,
              createdByUserId: input.createdByUserId,
              status: CaseAiAnalysisStatus.OK,
              sections: asJson(input.sections),
              provider: input.provider,
              model: input.model,
              citations: {
                create: input.citations.map((citation) => ({
                  citationType: citation.citationType,
                  title: citation.title,
                  reference: citation.reference,
                  excerpt: citation.excerpt,
                  sourceUrl: citation.sourceUrl,
                  sourceType: citation.sourceType,
                  documentId: citation.documentId,
                  documentVersionId: citation.documentVersionId,
                  nodeId: citation.nodeId,
                  caseEvidenceId: citation.caseEvidenceId,
                })),
              },
            }
          : {
              caseFileId: input.caseFileId,
              createdByUserId: input.createdByUserId,
              status: CaseAiAnalysisStatus.FAILED,
              failureReason: input.failureReason,
            },
      include: analysisInclude,
    });
    return mapRow(row);
  }

  async findLatestByCaseFileId(
    caseFileId: string,
  ): Promise<CaseAiAnalysisResult | null> {
    const db = getPrismaClient(this.client);
    const row = await db.caseAiAnalysis.findFirst({
      where: { caseFileId },
      orderBy: { createdAt: "desc" },
      include: analysisInclude,
    });
    return row ? mapRow(row) : null;
  }

  async listByCaseFileId(caseFileId: string): Promise<CaseAiAnalysisResult[]> {
    const db = getPrismaClient(this.client);
    const rows = await db.caseAiAnalysis.findMany({
      where: { caseFileId },
      orderBy: { createdAt: "desc" },
      include: analysisInclude,
    });
    return rows.map(mapRow);
  }
}

export const caseAiAnalysisRepository = new PrismaCaseAiAnalysisRepository();
