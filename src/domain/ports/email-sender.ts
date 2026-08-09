/**
 * Outbound email port — verification, password reset, notifications.
 * Application code must not import provider SDKs; use getEmailSender() at the composition root.
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Optional override; adapters fall back to EMAIL_FROM. */
  from?: string;
};

export type SendEmailResult = {
  /** Provider message id when available. */
  messageId?: string;
};

export interface EmailSender {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
