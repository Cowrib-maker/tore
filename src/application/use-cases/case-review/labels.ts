import { CaseFileAnalysisStatus } from "@/domain/entities/case-file";
import { LegalDomain } from "@/engine/doctrine";

const DOMAIN_MN: Record<string, string> = {
  [LegalDomain.CIVIL]: "Иргэний",
  [LegalDomain.CRIMINAL]: "Эрүүгийн",
  [LegalDomain.ADMINISTRATIVE]: "Захиргааны",
  [LegalDomain.CONSTITUTIONAL]: "Үндсэн хуулийн",
  [LegalDomain.PROCEDURAL]: "Процессын",
  [LegalDomain.UNKNOWN]: "Бусад",
};

const STATUS_MN: Record<string, string> = {
  [CaseFileAnalysisStatus.NOT_ANALYZED]: "Шинжлээгүй",
  [CaseFileAnalysisStatus.ANALYZED]: "Шинжилсэн",
  [CaseFileAnalysisStatus.ANALYSIS_FAILED]: "Шинжилгээ амжилтгүй",
};

export function legalDomainLabelMn(domain: string): string {
  return DOMAIN_MN[domain] ?? domain;
}

export function analysisStatusLabelMn(status: string): string {
  if (status === CaseFileAnalysisStatus.NOT_ANALYZED) return "Шинжлээгүй";
  if (status === CaseFileAnalysisStatus.ANALYSIS_FAILED) {
    return "Шинжилгээ амжилтгүй";
  }
  return STATUS_MN[status] ?? "Шинжилсэн";
}
