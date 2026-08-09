import { Resend } from "resend";

import type {
  EmailSender,
  SendEmailInput,
  SendEmailResult,
} from "@/domain/ports/email-sender";

export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;
  private readonly defaultFrom: string;

  constructor(apiKey: string, defaultFrom: string) {
    this.client = new Resend(apiKey);
    this.defaultFrom = defaultFrom;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const from = input.from ?? this.defaultFrom;
    const result = await this.client.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text,
    });

    if (result.error) {
      console.error("[email:resend] send failed", {
        to: input.to,
        subject: input.subject,
        error: result.error,
      });
      throw new Error(
        `Resend email failed: ${result.error.message ?? "unknown error"}`,
      );
    }

    return { messageId: result.data?.id };
  }
}
