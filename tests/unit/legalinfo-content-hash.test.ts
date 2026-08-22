import { describe, expect, it } from "vitest";

import {
  canonicalizeLegalSourceBytes,
  contentSha256Hex,
  createArchiveService,
  InMemoryArchiveRepository,
  LEGALINFO_CAPTCHA_STABLE,
  rawSha256Hex,
  sha256Hex,
  type IArchiveStorage,
} from "@/engine/data/archive";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function legalHtml(captchaNonce: string, articleHeading: string, body: string) {
  return `<!DOCTYPE html>
<html>
<body>
  <img src="https://legalinfo.mn/api/captcha?x=${captchaNonce}" alt="" />
  <div class="law_content">
    <div class="maincontenter">
      <p>${articleHeading}</p>
      <p>${body}</p>
    </div>
  </div>
</body>
</html>`;
}

class MemoryStorage implements IArchiveStorage {
  private readonly objects = new Map<string, Uint8Array>();

  async putIfAbsent(key: string, data: Uint8Array) {
    if (this.objects.has(key)) return { written: false };
    this.objects.set(key, data);
    return { written: true };
  }
  async get(key: string) {
    return this.objects.get(key) ?? null;
  }
  async has(key: string) {
    return this.objects.has(key);
  }
  async health() {
    return {
      ok: true,
      storage: "memory",
      checkedAt: new Date().toISOString(),
      detail: "ok",
    };
  }
}

describe("LegalInfo canonical content SHA-256", () => {
  it("same legal HTML + different captcha nonce → same contentSha256, different rawSha256", () => {
    const first = legalHtml(
      "1787404746728368",
      "17.1 дүгээр зүйл.Хулгайлах",
      "1.Бусдын эд хөрөнгийг хүч хэрэглэхгүйгээр, нууцаар, хууль бусаар авсан бол",
    );
    const second = legalHtml(
      "1787404749020298",
      "17.1 дүгээр зүйл.Хулгайлах",
      "1.Бусдын эд хөрөнгийг хүч хэрэглэхгүйгээр, нууцаар, хууль бусаар авсан бол",
    );
    expect(first.length).toBe(second.length);
    expect(rawSha256Hex(bytes(first))).not.toBe(rawSha256Hex(bytes(second)));
    expect(contentSha256Hex(bytes(first))).toBe(contentSha256Hex(bytes(second)));
    expect(new TextDecoder().decode(canonicalizeLegalSourceBytes(bytes(first)))).toContain(
      LEGALINFO_CAPTCHA_STABLE,
    );
    expect(new TextDecoder().decode(canonicalizeLegalSourceBytes(bytes(first)))).not.toMatch(
      /api\/captcha\?x=\d+/,
    );
  });

  it("meaningful article text change → different contentSha256", () => {
    const original = legalHtml(
      "1",
      "17.1 дүгээр зүйл.Хулгайлах",
      "1.Бусдын эд хөрөнгийг хүч хэрэглэхгүйгээр, нууцаар, хууль бусаар авсан бол",
    );
    const changed = legalHtml(
      "1",
      "17.1 дүгээр зүйл.Хулгайлах",
      "1.Бусдын эд хөрөнгийг илээр авсан бол",
    );
    expect(contentSha256Hex(bytes(original))).not.toBe(contentSha256Hex(bytes(changed)));
  });

  it("meaningful article-number change → different contentSha256", () => {
    const original = legalHtml(
      "1",
      "17.1 дүгээр зүйл.Хулгайлах",
      "1.Бусдын эд хөрөнгийг хүч хэрэглэхгүйгээр, нууцаар, хууль бусаар авсан бол",
    );
    const changed = legalHtml(
      "1",
      "17.2 дугаар зүйл.Хулгайлах",
      "1.Бусдын эд хөрөнгийг хүч хэрэглэхгүйгээр, нууцаар, хууль бусаар авсан бол",
    );
    expect(contentSha256Hex(bytes(original))).not.toBe(contentSha256Hex(bytes(changed)));
  });

  it("archive integrity still verifies against raw stored bytes", async () => {
    const storage = new MemoryStorage();
    const archive = createArchiveService({
      repository: new InMemoryArchiveRepository(),
      storage,
    });
    const firstBytes = bytes(
      legalHtml("1787404746728368", "17.1 дүгээр зүйл.Хулгайлах", "1.Текст."),
    );
    const secondBytes = bytes(
      legalHtml("1787404749020298", "17.1 дүгээр зүйл.Хулгайлах", "1.Текст."),
    );

    const first = await archive.store({
      connectorId: "mn.legalinfo",
      source: "legalinfo.mn",
      sourceId: "legalinfo",
      lawId: "11634",
      jurisdiction: "MN",
      authority: "LEGALINFO",
      sourceType: "law",
      originalUrl: "https://legalinfo.mn/mn/detail?lawId=11634",
      originalFileName: "legalinfo-detail.html",
      bytes: firstBytes,
    });
    const second = await archive.store({
      connectorId: "mn.legalinfo",
      source: "legalinfo.mn",
      sourceId: "legalinfo",
      lawId: "11634",
      jurisdiction: "MN",
      authority: "LEGALINFO",
      sourceType: "law",
      originalUrl: "https://legalinfo.mn/mn/detail?lawId=11634",
      originalFileName: "legalinfo-detail.html",
      bytes: secondBytes,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record.archiveId).toBe(first.record.archiveId);
    expect(first.record.sha256).toBe(sha256Hex(firstBytes));
    expect(first.record.contentSha256).toBe(contentSha256Hex(firstBytes));
    expect(first.record.contentSha256).toBe(contentSha256Hex(secondBytes));
    expect(first.record.sha256).not.toBe(sha256Hex(secondBytes));

    const verified = await archive.verifyArchiveIntegrity(first.record.sha256);
    expect(verified.archiveId).toBe(first.record.archiveId);
    expect(await storage.get(first.record.storageKey)).toEqual(firstBytes);
  });
});
