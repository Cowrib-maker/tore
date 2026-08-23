import { describe, expect, it } from "vitest";

import { interpretLegalAiChatAccess } from "@/components/legal-ai/interpret-legal-ai-chat-access";
import {
  legalAiHref,
  loginHrefForLegalAi,
  registerClientHrefForLegalAi,
} from "@/domain/services/rbac";

describe("homepage and /legal-ai shared access interpretation", () => {
  it("maps 401 to auth gate with preserved question", () => {
    const result = interpretLegalAiChatAccess({
      status: 401,
      body: { error: "Нэвтэрнэ үү." },
      question: "Дарга намайг ажлаас халчихлаа",
    });
    expect(result).toMatchObject({
      type: "auth",
      gate: {
        kind: "auth",
        question: "Дарга намайг ажлаас халчихлаа",
      },
    });
  });

  it("maps 402 to billing gate without frontend quota math", () => {
    const result = interpretLegalAiChatAccess({
      status: 402,
      body: { error: "Төлбөртэй багц хэрэгтэй." },
      question: "Гэрээний заалт ойлгомжгүй",
    });
    expect(result).toMatchObject({
      type: "billing",
      gate: {
        kind: "billing",
        question: "Гэрээний заалт ойлгомжгүй",
      },
    });
  });

  it("preserves q= through login and register hrefs", () => {
    const question = "Нөхөр хүүхдээ аваад явчихсан";
    const href = legalAiHref(question);
    expect(href).toContain("/legal-ai?q=");
    expect(href).toContain(encodeURIComponent(question));
    expect(loginHrefForLegalAi(question)).toBe(
      `/login?callbackUrl=${encodeURIComponent(href)}`,
    );
    expect(registerClientHrefForLegalAi(question)).toBe(
      `/register/client?callbackUrl=${encodeURIComponent(href)}`,
    );
  });
});
