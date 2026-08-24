import type { ActorContext } from "@/application/common/actor-context";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";

import { CaseFileAnalysisStatus } from "@/domain/entities/case-file";

import { deriveCaseActivity, type CaseActivityItem } from "./case-activity";
import {
  type CaseAiDeps,
  type CaseConversationSummary,
} from "./case-conversations";
import { analysisStatusLabelMn, legalDomainLabelMn } from "./labels";
import { displayCaseStatus } from "./payload";

export type LawyerWorkspaceCaseCard = {
  caseId: string;
  title: string;
  domain: string;
  domainLabel: string;
  status: string;
  statusLabel: string;
  conversationCount: number;
  documentCount: number;
  lastActivityAt: string;
  lastActivityLabel: string;
};

export type LawyerWorkspaceRecentConversation = {
  id: string;
  title: string;
  caseTitle: string | null;
  updatedAt: string;
};

export type LawyerWorkspaceSummary = {
  caseCount: number;
  analyzedCaseCount: number;
  notAnalyzedCaseCount: number;
  conversationCount: number;
  conversationsLast7Days: number;
  documentCount: number;
};

export type LawyerWorkspaceHomeView = {
  cases: LawyerWorkspaceCaseCard[];
  recentConversations: LawyerWorkspaceRecentConversation[];
  activity: CaseActivityItem[];
  summary: LawyerWorkspaceSummary;
};

const RECENT_CONVERSATION_LIMIT = 8;
const ACTIVITY_LIMIT = 10;
const CONVERSATION_FETCH = 50;

export async function loadLawyerWorkspaceHome(
  actor: ActorContext,
  deps: CaseAiDeps,
): Promise<LawyerWorkspaceHomeView> {
  if (actor.role !== UserRole.LAWYER) {
    throw new ForbiddenError("Only licensed lawyers may open this workspace.");
  }

  const files = await deps.repository.listByOwnerLawyerId(actor.userId);
  const [conversations, caseConversationRows] = await Promise.all([
    deps.store.listOwnedRecentConversations(actor.userId, CONVERSATION_FETCH),
    Promise.all(
      files.map((file) =>
        deps.store.listOwnedCaseConversations(actor.userId, file.id),
      ),
    ),
  ]);

  const caseTitleById = new Map(files.map((file) => [file.id, file.title]));
  const conversationsByCase = new Map<string, CaseConversationSummary[]>();
  files.forEach((file, index) => {
    conversationsByCase.set(
      file.id,
      (caseConversationRows[index] ?? []).map((row) => ({
        id: row.id,
        title: row.title?.trim() || "Шинэ яриа",
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    );
  });

  const cases: LawyerWorkspaceCaseCard[] = files.map((file) => {
    const caseConversations = conversationsByCase.get(file.id) ?? [];
    const activity = deriveCaseActivity(file, caseConversations);
    const latest = activity[0];
    const status = displayCaseStatus(file);
    return {
      caseId: file.id,
      title: file.title,
      domain: file.legalDomain,
      domainLabel: legalDomainLabelMn(file.legalDomain),
      status,
      statusLabel: analysisStatusLabelMn(status),
      conversationCount: caseConversations.length,
      documentCount: file.evidence.filter((item) => item.fileReference).length,
      lastActivityAt: latest?.at ?? file.updatedAt.toISOString(),
      lastActivityLabel: latest?.label ?? "Хэрэг үүсгэсэн",
    };
  });

  const recentConversations = conversations
    .slice(0, RECENT_CONVERSATION_LIMIT)
    .map((row) => ({
      id: row.id,
      title: row.title?.trim() || "Шинэ яриа",
      caseTitle: row.caseFileId
        ? (caseTitleById.get(row.caseFileId) ?? null)
        : null,
      updatedAt: row.updatedAt.toISOString(),
    }));

  const activity = files
    .flatMap((file) =>
      deriveCaseActivity(file, conversationsByCase.get(file.id) ?? []).map(
        (item) => ({
          ...item,
          id: `${file.id}:${item.id}`,
          label: `${file.title} · ${item.label}`,
        }),
      ),
    )
    .concat(
      conversations
        .filter((row) => !row.caseFileId)
        .map((row) => ({
          id: `ai-started:${row.id}`,
          at: row.createdAt.toISOString(),
          label: "AI яриа эхлүүлсэн",
        })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, ACTIVITY_LIMIT);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const caseLinkedCount = caseConversationRows.reduce(
    (total, rows) => total + rows.length,
    0,
  );
  const unattachedCount = conversations.filter((row) => !row.caseFileId).length;
  const summary: LawyerWorkspaceSummary = {
    caseCount: files.length,
    analyzedCaseCount: files.filter(
      (file) => file.analysisStatus === CaseFileAnalysisStatus.ANALYZED,
    ).length,
    notAnalyzedCaseCount: files.filter(
      (file) => file.analysisStatus === CaseFileAnalysisStatus.NOT_ANALYZED,
    ).length,
    conversationCount: caseLinkedCount + unattachedCount,
    conversationsLast7Days: conversations.filter(
      (row) => row.updatedAt.getTime() >= weekAgo,
    ).length,
    documentCount: cases.reduce((total, item) => total + item.documentCount, 0),
  };

  return { cases, recentConversations, activity, summary };
}
