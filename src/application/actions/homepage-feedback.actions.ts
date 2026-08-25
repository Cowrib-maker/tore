"use server";

import {
  AUTH_ACTION_CODE,
  type ActionState,
} from "@/application/common/action-state";
import { getClientIp } from "@/application/common/client-ip";
import { mapActionError } from "@/application/common/map-action-error";
import { parseWithSchema } from "@/application/common/parse-form";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { submitHomepageFeedbackUseCase } from "@/application/use-cases/homepage/submit-homepage-feedback";
import { homepageFeedbackSchema } from "@/application/validators/homepage-feedback.schema";
import { getEmailSender } from "@/infrastructure/email";
import { platformSettingRepository } from "@/infrastructure/repositories";
import { HOMEPAGE_FEEDBACK_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";

export async function submitHomepageFeedbackAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ipAddress = await getClientIp();
  const limited = await enforceRateLimit(
    `homepage-feedback:${ipAddress ?? "unknown"}`,
    HOMEPAGE_FEEDBACK_RATE_LIMIT,
    "requests",
  );
  if (limited) return limited;

  const parsed = parseWithSchema(homepageFeedbackSchema, {
    kind: formData.get("kind"),
    message: formData.get("message"),
    email: formData.get("email") ?? "",
  });
  if (!parsed.ok) return parsed.state;

  try {
    await submitHomepageFeedbackUseCase(parsed.data, {
      emailSender: getEmailSender(),
      platformSettingRepository,
    });
    return { success: true, code: AUTH_ACTION_CODE.RESEND_SENT };
  } catch (error) {
    return mapActionError(error);
  }
}
