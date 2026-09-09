import { describe, expect, it } from "vitest";

import {
  DomainLabel,
  PromptBuilderService,
  PromptTurnKind,
  UserType,
} from "@/engine/gateway";
import { wrapUntrustedDocumentAttachments } from "@/application/ai/untrusted-document-text";
import { MAX_DOCUMENT_EXTRACT_CHARS } from "@/application/ai/legal-ai-document.constants";

/**
 * Regression coverage for the "upload succeeds but the AI silently ignores
 * the file" bug: when every attachment is NEEDS_OCR (no extractable text),
 * the model must be told to say so out loud instead of answering as if
 * nothing was attached or as if it actually read the file.
 */
describe("PromptBuilderService attachment honesty", () => {
  const builder = new PromptBuilderService();

  it("instructs the model to admit an unreadable attachment when only NEEDS_OCR text exists", () => {
    const documentContextBlock = wrapUntrustedDocumentAttachments(
      [{ fileName: "scan.pdf", extractedText: "", extractStatus: "NEEDS_OCR" }],
      MAX_DOCUMENT_EXTRACT_CHARS,
    );
    expect(documentContextBlock).not.toBe("");

    const prompt = builder.build({
      message: "Энэ баримтад юу бичсэн байна вэ?",
      userType: UserType.PUBLIC,
      domain: DomainLabel.LEGAL,
      turnKind: PromptTurnKind.LEGAL,
      capability: "CITIZEN",
      corpusAvailable: false,
      documentContextBlock,
      hasReadableDocumentText: false,
    });

    expect(prompt.systemPrompt).toMatch(/уншиж чадаагүйгээ хэрэглэгчид/);
    expect(prompt.systemPrompt).not.toMatch(/DOCUMENT FACTS: зөвхөн extract-д/);
  });

  it("still uses the normal document-facts rule when real text was extracted", () => {
    const documentContextBlock = wrapUntrustedDocumentAttachments(
      [
        {
          fileName: "contract.pdf",
          extractedText: "1-р зүйл. Талууд дараах гэрээг байгуулав.",
          extractStatus: "OK",
        },
      ],
      MAX_DOCUMENT_EXTRACT_CHARS,
    );

    const prompt = builder.build({
      message: "Энэ гэрээг дүгнэнэ үү.",
      userType: UserType.LAWYER,
      domain: DomainLabel.LEGAL,
      turnKind: PromptTurnKind.LEGAL,
      capability: "LAWYER",
      corpusAvailable: false,
      documentContextBlock,
      hasReadableDocumentText: true,
    });

    expect(prompt.systemPrompt).toMatch(/DOCUMENT FACTS: зөвхөн extract-д/);
    expect(prompt.systemPrompt).not.toMatch(/уншиж чадаагүйгээ хэрэглэгчид/);
  });

  it("falls back to the no-attachment rule when nothing was attached at all", () => {
    const prompt = builder.build({
      message: "Хөдөлмөрийн гэрээ гэж юу вэ?",
      userType: UserType.PUBLIC,
      domain: DomainLabel.LEGAL,
      turnKind: PromptTurnKind.LEGAL,
      capability: "CITIZEN",
      corpusAvailable: false,
    });

    expect(prompt.systemPrompt).not.toMatch(/уншиж чадаагүйгээ хэрэглэгчид/);
    expect(prompt.systemPrompt).not.toMatch(/DOCUMENT FACTS: зөвхөн extract-д/);
  });
});
