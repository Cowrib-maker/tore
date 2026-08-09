import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import type {
  EmailSender,
  SendEmailInput,
  SendEmailResult,
} from "@/domain/ports/email-sender";

export type SmtpEmailSenderConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  defaultFrom: string;
};

export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;
  private readonly defaultFrom: string;

  constructor(config: SmtpEmailSenderConfig) {
    this.defaultFrom = config.defaultFrom;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth:
        config.user && config.pass
          ? { user: config.user, pass: config.pass }
          : undefined,
    });
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const from = input.from ?? this.defaultFrom;
    try {
      const info = await this.transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html ?? input.text,
      });
      return { messageId: info.messageId };
    } catch (error) {
      console.error("[email:smtp] send failed", {
        to: input.to,
        subject: input.subject,
        error,
      });
      throw error instanceof Error
        ? error
        : new Error("SMTP email send failed");
    }
  }
}
