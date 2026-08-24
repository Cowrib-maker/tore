import type { CaseFile } from "@/domain/entities/case-file";
import { buildAppFilePath } from "@/infrastructure/storage/file-access";

import type { CaseConversationSummary } from "./case-conversations";

export type CaseActivityItem = {
  id: string;
  at: string;
  label: string;
};

/**
 * Timeline from existing timestamps only. Does not invent events that
 * cannot be derived from CaseFile / conversation rows.
 */
export function deriveCaseActivity(
  file: CaseFile,
  conversations: CaseConversationSummary[],
): CaseActivityItem[] {
  const items: CaseActivityItem[] = [
    {
      id: `case-created:${file.id}`,
      at: file.createdAt.toISOString(),
      label: "Хэрэг үүсгэсэн",
    },
  ];

  for (const conversation of conversations) {
    items.push({
      id: `ai-started:${conversation.id}`,
      at: conversation.createdAt,
      label: "AI яриа эхлүүлсэн",
    });
  }

  for (const evidence of file.evidence) {
    if (!evidence.fileReference) continue;
    items.push({
      id: `doc-added:${evidence.id}`,
      at: evidence.createdAt.toISOString(),
      label: "Баримт нэмсэн",
    });
  }

  if (file.lastAnalyzedAt) {
    items.push({
      id: `analyzed:${file.id}`,
      at: file.lastAnalyzedAt.toISOString(),
      label: "Хэрэг шинжилсэн",
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export type CaseDocumentView = {
  id: string;
  fileName: string;
  description: string | null;
  createdAt: string;
  href: string;
};

export function toCaseDocumentViews(file: CaseFile): CaseDocumentView[] {
  return file.evidence
    .filter((item) => item.fileReference)
    .map((item) => ({
      id: item.id,
      fileName: item.title,
      description: item.description,
      createdAt: item.createdAt.toISOString(),
      href: buildAppFilePath(item.fileReference!),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
