import type {
  EmailSender,
  SendEmailInput,
  SendEmailResult,
} from "@/domain/ports/email-sender";

/**
 * Development / test adapter — logs the full message including verification links.
 * Never use as the production provider without an explicit override.
 */
export class ConsoleEmailSender implements EmailSender {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const from = input.from ?? "(default from)";
    console.info(
      [
        "[email:console] Outbound email",
        `from=${from}`,
        `to=${input.to}`,
        `subject=${input.subject}`,
        "----- text -----",
        input.text,
        input.html ? "----- html -----\n" + input.html : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return { messageId: `console-${Date.now()}` };
  }
}
