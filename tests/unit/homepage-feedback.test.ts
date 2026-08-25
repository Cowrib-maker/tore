import { describe, expect, it, vi } from "vitest";

import { submitHomepageFeedbackUseCase } from "@/application/use-cases/homepage/submit-homepage-feedback";
import { homepageFeedbackSchema } from "@/application/validators/homepage-feedback.schema";
import { PLATFORM_SETTING_KEYS } from "@/domain/constants/platform-settings";

describe("homepage feedback", () => {
  it("accepts feedback, suggestion, and bug reports", () => {
    expect(
      homepageFeedbackSchema.parse({
        kind: "bug",
        message: "The chat composer did not submit.",
        email: "",
      }).kind,
    ).toBe("bug");
    expect(
      homepageFeedbackSchema.safeParse({
        kind: "feedback",
        message: "short",
        email: "",
      }).success,
    ).toBe(false);
  });

  it("emails support without inventing extra product behavior", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "test" });
    await submitHomepageFeedbackUseCase(
      {
        kind: "suggestion",
        message: "Please add a quieter homepage.",
        email: "person@example.com",
      },
      {
        emailSender: { send },
        platformSettingRepository: {
          findByKey: async (key: string) =>
            key === PLATFORM_SETTING_KEYS.SUPPORT_EMAIL
              ? {
                  key,
                  value: "support@tore.mn",
                  description: null,
                  updatedAt: new Date(),
                }
              : null,
          findMany: async () => [],
          findAll: async () => [],
          updateValue: async () => {
            throw new Error("unused");
          },
        },
      },
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      to: "support@tore.mn",
      subject: "[TORE SUGGESTION] Public homepage",
    });
    expect(send.mock.calls[0]?.[0].text).toContain("person@example.com");
    expect(send.mock.calls[0]?.[0].text).toContain(
      "Please add a quieter homepage.",
    );
  });
});
