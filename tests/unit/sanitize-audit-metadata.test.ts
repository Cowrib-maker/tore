import { describe, expect, it } from "vitest";

import { sanitizeAuditMetadata } from "@/application/common/sanitize-audit-metadata";

describe("sanitizeAuditMetadata", () => {
  it("returns null unchanged", () => {
    expect(sanitizeAuditMetadata(null)).toBeNull();
  });

  it("redacts password/secret/token/apiKey/authorization values", () => {
    const result = sanitizeAuditMetadata({
      password: "hunter2",
      passwordHash: "abc123",
      secret: "s3cr3t",
      token: "tok_live_abc",
      apiKey: "sk-abc",
      authorization: "Bearer abc",
      privateKey: "-----BEGIN KEY-----",
    });
    expect(result).toEqual({
      password: "[REDACTED]",
      passwordHash: "[REDACTED]",
      secret: "[REDACTED]",
      token: "[REDACTED]",
      apiKey: "[REDACTED]",
      authorization: "[REDACTED]",
      privateKey: "[REDACTED]",
    });
  });

  it("keeps *Id reference fields and ordinary values untouched", () => {
    const result = sanitizeAuditMetadata({
      credentialId: "cred-1",
      lawyerProfileId: "lp-1",
      userId: "u-1",
      status: "APPROVED",
      previousValue: "PENDING",
      newValue: "APPROVED",
    });
    expect(result).toEqual({
      credentialId: "cred-1",
      lawyerProfileId: "lp-1",
      userId: "u-1",
      status: "APPROVED",
      previousValue: "PENDING",
      newValue: "APPROVED",
    });
  });

  it("redacts sensitive keys inside nested objects and arrays", () => {
    const result = sanitizeAuditMetadata({
      nested: { token: "abc", keep: "ok" },
      list: [{ secret: "x" }, { fine: "y" }],
    });
    expect(result).toEqual({
      nested: { token: "[REDACTED]", keep: "ok" },
      list: [{ secret: "[REDACTED]" }, { fine: "y" }],
    });
  });
});
