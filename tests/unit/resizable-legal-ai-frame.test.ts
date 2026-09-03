import { describe, expect, it } from "vitest";

import { clampChatDimension } from "@/components/legal-ai/resizable-legal-ai-frame";

describe("ResizableLegalAiFrame", () => {
  it("enforces chat resize bounds", () => {
    expect(clampChatDimension(400, 640, 1400)).toBe(640);
    expect(clampChatDimension(1000, 640, 1400)).toBe(1000);
    expect(clampChatDimension(1800, 640, 1400)).toBe(1400);
  });
});
