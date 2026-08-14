import { ArchiveArtifactFormat, type ArchiveArtifactFormat as ArtifactFormat } from "./types";

const MIME_BY_FORMAT: Record<ArtifactFormat, string> = {
  html: "text/html",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xml: "application/xml",
  json: "application/json",
  zip: "application/zip",
  txt: "text/plain",
};

const FORMAT_BY_EXTENSION: Record<string, ArtifactFormat> = {
  html: ArchiveArtifactFormat.HTML,
  htm: ArchiveArtifactFormat.HTML,
  pdf: ArchiveArtifactFormat.PDF,
  docx: ArchiveArtifactFormat.DOCX,
  xml: ArchiveArtifactFormat.XML,
  json: ArchiveArtifactFormat.JSON,
  zip: ArchiveArtifactFormat.ZIP,
  txt: ArchiveArtifactFormat.TXT,
};

export function mimeTypeForFileName(
  fileName: string,
  explicit?: string,
): string {
  if (explicit) {
    return explicit;
  }
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const format = FORMAT_BY_EXTENSION[extension];
  return format ? MIME_BY_FORMAT[format] : "application/octet-stream";
}

export const SUPPORTED_MIME_TYPES = Object.values(MIME_BY_FORMAT);
