import { describe, expect, it } from "vitest";

import { contentSha256Hex } from "@/engine/data/archive";
import { knowledgeDocumentId } from "@/engine/knowledge";

describe("knowledgeDocumentId", () => {
  const url = "https://legalinfo.mn/mn/detail?lawId=310";

  it("A. same source URL + same canonical hash is one identity", () => {
    const hash = contentSha256Hex(new TextEncoder().encode("<p>1 дүгээр зүйл</p>"));
    expect(knowledgeDocumentId(url, hash)).toBe(knowledgeDocumentId(url, hash));
  });

  it("B. same source URL + different canonical hash is two identities", () => {
    const a = contentSha256Hex(new TextEncoder().encode("<p>хуучин</p>"));
    const b = contentSha256Hex(new TextEncoder().encode("<p>шинэ</p>"));
    expect(knowledgeDocumentId(url, a)).not.toBe(knowledgeDocumentId(url, b));
  });

  it("C. captcha-only difference keeps the same canonical identity", () => {
    const legal = "<p>1 дүгээр зүйл. Зорилт</p>";
    const first = new TextEncoder().encode(
      `${legal}<img src="api/captcha?x=111">`,
    );
    const second = new TextEncoder().encode(
      `${legal}<img src="api/captcha?x=999">`,
    );
    expect(contentSha256Hex(first)).toBe(contentSha256Hex(second));
    expect(knowledgeDocumentId(url, contentSha256Hex(first))).toBe(
      knowledgeDocumentId(url, contentSha256Hex(second)),
    );
  });

  it("D. article text change is a new version identity", () => {
    const oldText = contentSha256Hex(
      new TextEncoder().encode("<p>17.1. Хуучин эх</p>"),
    );
    const newText = contentSha256Hex(
      new TextEncoder().encode("<p>17.1. Шинэчилсэн эх</p>"),
    );
    expect(oldText).not.toBe(newText);
    expect(knowledgeDocumentId(url, oldText)).not.toBe(
      knowledgeDocumentId(url, newText),
    );
  });
});
