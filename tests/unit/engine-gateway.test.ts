import { describe, expect, it } from "vitest";

import {
  DomainLabel,
  GatewayResponseType,
  RuleBasedDomainFilter,
  UserType,
  UserTypeService,
  createLegalAiGateway,
  createTermRules,
} from "@/engine/gateway";
import { ResponseFormatterService } from "@/engine/gateway/response-formatter.service";

describe("RuleBasedDomainFilter", () => {
  const filter = new RuleBasedDomainFilter();

  it("classifies Mongolian and English legal questions as LEGAL", () => {
    expect(filter.classify("Хөдөлмөрийн гэрээг хэрхэн цуцлах вэ?").domain).toBe(
      DomainLabel.LEGAL,
    );
    expect(filter.classify("Do I need a lawyer for this contract?").domain).toBe(
      DomainLabel.LEGAL,
    );
  });

  it("classifies inflected Mongolian legal phrases as LEGAL", () => {
    expect(
      filter.classify(
        "Хулгайлах гэмт хэргийн бүрэлдэхүүнд ямар шинжүүд хамаарах вэ?",
      ).domain,
    ).toBe(DomainLabel.LEGAL);
    expect(
      filter.classify("Эрүүгийн хуулийн 17.1 дүгээр зүйл юу гэж заасан бэ?")
        .domain,
    ).toBe(DomainLabel.LEGAL);
    expect(
      filter.classify(
        "Гэмт хэрэг үйлдсэн этгээдэд эрүүгийн хариуцлага хэзээ хүлээлгэх вэ?",
      ).domain,
    ).toBe(DomainLabel.LEGAL);
    expect(
      filter.classify("Энэ асуудлыг хуулийн дагуу хэрхэн шийдэх вэ?").domain,
    ).toBe(DomainLabel.LEGAL);
    expect(filter.classify("гэмт хэргийг хэрхэн тодорхойлох вэ?").domain).toBe(
      DomainLabel.LEGAL,
    );
    expect(filter.classify("гэмт хэрэгт холбогдсон уу?").domain).toBe(
      DomainLabel.LEGAL,
    );
    expect(filter.classify("гэмт хэргээс хэрхэн урьдчилан сэргийлэх вэ?").domain).toBe(
      DomainLabel.LEGAL,
    );
  });

  it("classifies off-topic messages as NON_LEGAL", () => {
    expect(filter.classify("What's the weather in Ulaanbaatar?").domain).toBe(
      DomainLabel.NON_LEGAL,
    );
    expect(filter.classify("Хоолны жор өгөөч").domain).toBe(DomainLabel.NON_LEGAL);
    expect(filter.classify("Өнөөдөр цаг агаар ямар байна?").domain).toBe(
      DomainLabel.NON_LEGAL,
    );
    expect(filter.classify("Надад төрсөн өдрийн мэндчилгээ бичиж өг.").domain).toBe(
      DomainLabel.NON_LEGAL,
    );
    expect(filter.classify("Энэ өгүүлбэрийг англи хэл рүү орчуул.").domain).toBe(
      DomainLabel.NON_LEGAL,
    );
  });

  it("accepts additional rules without mutating the original filter", () => {
    const extended = filter.withRules(
      createTermRules(["квантфизик"], DomainLabel.LEGAL),
    );
    expect(filter.classify("квантфизик").domain).toBe(DomainLabel.NON_LEGAL);
    expect(extended.classify("квантфизик").domain).toBe(DomainLabel.LEGAL);
  });
});

describe("UserTypeService", () => {
  const service = new UserTypeService();

  it("resolves PUBLIC, LAWYER, and ENTERPRISE from context", () => {
    expect(service.resolve()).toBe(UserType.PUBLIC);
    expect(service.resolve({ role: "CLIENT" })).toBe(UserType.PUBLIC);
    expect(service.resolve({ role: "LAWYER" })).toBe(UserType.LAWYER);
    expect(service.resolve({ organizationId: "org-1" })).toBe(
      UserType.ENTERPRISE,
    );
    expect(service.resolve({ userType: UserType.PUBLIC, role: "LAWYER" })).toBe(
      UserType.PUBLIC,
    );
  });
});

describe("ResponseFormatterService", () => {
  it("returns the unified envelope shape", () => {
    const response = new ResponseFormatterService().formatLegalInformation({
      message: "Мэдээлэл",
    });
    expect(response).toEqual({
      success: true,
      type: GatewayResponseType.LEGAL_INFORMATION,
      message: "Мэдээлэл",
      suggestions: [],
      citations: [],
      metadata: {},
    });
  });
});

describe("GatewayService", () => {
  const gateway = createLegalAiGateway();

  it("builds a legal turn with a prompt and LEGAL_INFORMATION envelope", async () => {
    const turn = await gateway.createTurn({
      message: "Шүүхэд нэхэмжлэл гаргах журам юу вэ?",
      userContext: { role: "LAWYER" },
    });

    expect(turn.domain).toBe(DomainLabel.LEGAL);
    expect(turn.userType).toBe(UserType.LAWYER);
    expect(turn.prompt?.systemPrompt).toContain("LAWYER");
    expect(turn.response.success).toBe(true);
    expect(turn.response.type).toBe(GatewayResponseType.LEGAL_INFORMATION);
    expect(turn.response.citations).toEqual([]);
    expect(turn.response.metadata.promptReady).toBe(true);
  });

  it("does not build a prompt for NON_LEGAL messages", async () => {
    const turn = await gateway.createTurn({
      message: "Tell me a football score",
    });

    expect(turn.domain).toBe(DomainLabel.NON_LEGAL);
    expect(turn.prompt).toBeNull();
    expect(turn.response.success).toBe(true);
    expect(turn.response.type).toBe(GatewayResponseType.OUT_OF_DOMAIN);
    expect(turn.response.suggestions.length).toBeGreaterThan(0);
  });

  it("allows injecting a replacement domain filter", async () => {
    const gatewayWithModelStub = createLegalAiGateway({
      domainFilter: {
        classify: () => ({
          domain: DomainLabel.LEGAL,
          method: "model",
          matchedRuleIds: ["classifier:v1"],
          confidence: 0.91,
        }),
      },
    });

    const turn = await gatewayWithModelStub.createTurn({
      message: "unrelated text that rules would reject",
    });

    expect(turn.domain).toBe(DomainLabel.LEGAL);
    expect(turn.response.metadata.filterMethod).toBe("model");
  });
});
