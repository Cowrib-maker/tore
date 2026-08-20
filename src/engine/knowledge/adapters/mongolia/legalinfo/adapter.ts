import { createHash } from "node:crypto";

import {
  CanonicalInstrumentKind,
  type CanonicalSourceDocument,
  type ISourceAdapter,
  type SourceAdapterInput,
} from "../../../canonical";
import {
  LegalDocumentStatus,
  LegalIdentifierScheme,
  LegalSourceKind,
  type LegalIdentifier,
} from "../../../schema";
import {
  inferMongolianInstrumentClass,
  inferMongolianLawTitle,
  mongolianLawOutline,
} from "../law-outline";
import { extractLegalInfoMetadata, legalInfoHtmlToLines } from "./html";

/**
 * LegalInfo.mn HTML → canonical source document.
 * Does not fetch, store, or parse into LegalDocument.
 */
export class LegalInfoSourceAdapter implements ISourceAdapter {
  readonly adapterId = "mongolia.legalinfo";
  readonly jurisdiction = "MN";

  adapt(input: SourceAdapterInput): CanonicalSourceDocument {
    if (typeof input.html !== "string") {
      throw new Error("LegalInfo adapter requires html");
    }

    const meta = extractLegalInfoMetadata(input.html, input.officialUrl);
    const lines = legalInfoHtmlToLines(input.html);
    const title = meta.title ?? inferMongolianLawTitle(lines) ?? "Untitled";
    const officialUrl =
      meta.officialUrl ??
      (meta.lawId
        ? `https://legalinfo.mn/mn/detail?lawId=${encodeURIComponent(meta.lawId)}`
        : null);
    const identifiers = buildIdentifiers(
      meta.lawId,
      meta.documentNumber,
      officialUrl,
    );

    return {
      instrumentKind: CanonicalInstrumentKind.LAW,
      sourceKind: LegalSourceKind.LAW,
      identity: {
        id: documentId(meta.lawId, officialUrl, title),
        jurisdiction: "MN",
        language: "mn",
        title,
        identifiers,
      },
      publication: {
        issuer: "Улсын Их Хурал",
        officialUrl,
        documentNumber: meta.documentNumber,
        issuedOn: meta.issuedOn,
        publishedOn: null,
        publicationSeries: meta.publicationSeries,
      },
      temporal: {
        status: meta.effectiveOn
          ? LegalDocumentStatus.IN_FORCE
          : LegalDocumentStatus.UNKNOWN,
        effectiveOn: meta.effectiveOn,
        validFrom: meta.effectiveOn,
        validTo: null,
      },
      provenance: {
        sourceId: "legalinfo",
      },
      outlinePathPrefix: meta.lawId ? `law-${meta.lawId}` : "law",
      outline: mongolianLawOutline(lines),
      law: {
        instrumentClass: inferMongolianInstrumentClass(title, lines),
        enactingBody: "Улсын Их Хурал",
      },
    };
  }
}

function buildIdentifiers(
  lawId: string | null,
  documentNumber: string | null,
  officialUrl: string | null,
): LegalIdentifier[] {
  const identifiers: LegalIdentifier[] = [];
  if (lawId) {
    identifiers.push({
      scheme: LegalIdentifierScheme.LEGALINFO_LAW_ID,
      value: lawId,
    });
  }
  if (documentNumber) {
    identifiers.push({
      scheme: LegalIdentifierScheme.DOCUMENT_NUMBER,
      value: documentNumber,
    });
  }
  if (officialUrl) {
    identifiers.push({
      scheme: LegalIdentifierScheme.OFFICIAL_URL,
      value: officialUrl,
    });
  }
  return identifiers;
}

function documentId(
  lawId: string | null,
  officialUrl: string | null,
  title: string,
): string {
  if (lawId) {
    return `legalinfo:law:${lawId}`;
  }
  const seed = officialUrl ?? title;
  return `legalinfo:law:${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}
