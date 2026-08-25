import { PLATFORM_SETTING_KEYS } from "@/domain/constants/platform-settings";
import type { EmailSender } from "@/domain/ports/email-sender";
import type { PlatformSettingRepository } from "@/domain/repositories/platform-setting-repository";
import type { HomepageFeedbackInput } from "@/application/validators/homepage-feedback.schema";

const FALLBACK_SUPPORT_EMAIL = "support@tore.mn";

export type SubmitHomepageFeedbackDeps = {
  emailSender: EmailSender;
  platformSettingRepository: PlatformSettingRepository;
};

export async function submitHomepageFeedbackUseCase(
  input: HomepageFeedbackInput,
  deps: SubmitHomepageFeedbackDeps,
): Promise<void> {
  const setting = await deps.platformSettingRepository.findByKey(
    PLATFORM_SETTING_KEYS.SUPPORT_EMAIL,
  );
  const to = setting?.value.trim() || FALLBACK_SUPPORT_EMAIL;
  const contact = input.email?.trim() || "not provided";
  const kind = input.kind.toUpperCase();

  await deps.emailSender.send({
    to,
    subject: `[TORE ${kind}] Public homepage`,
    text: [
      `Kind: ${input.kind}`,
      `Contact: ${contact}`,
      "",
      input.message.trim(),
    ].join("\n"),
  });
}
