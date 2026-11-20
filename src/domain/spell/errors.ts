import { DomainError } from "@/domain/errors/domain-error";

/**
 * Spell failures carry a stable machine `code` the desktop client switches on,
 * plus optional safe `details`. Messages never contain license codes, hashes,
 * keys or internal ids beyond those the caller already holds.
 */
export class SpellError extends DomainError {
  constructor(
    message: string,
    code: SpellErrorCode,
    statusCode: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, code, statusCode);
    this.name = "SpellError";
  }
}

export type SpellErrorCode =
  | "SPELL_DISABLED"
  | "SPELL_NOT_CONFIGURED"
  | "LICENSE_CODE_INVALID"
  | "LICENSE_REVOKED"
  | "LICENSE_EXPIRED"
  | "LICENSE_REDEEM_WINDOW_CLOSED"
  | "TRANSFER_CONFIRMATION_REQUIRED"
  | "TRANSFER_COOLDOWN_ACTIVE"
  | "ACTIVATION_NOT_ACTIVE"
  | "INSTALLATION_REVOKED"
  | "INSTALLATION_UNKNOWN"
  | "REQUEST_SIGNATURE_INVALID"
  | "REQUEST_TIMESTAMP_INVALID"
  | "REQUEST_REPLAYED"
  | "TOO_MANY_ATTEMPTS"
  | "ACTIVATION_CONFLICT";

export const spellErrors = {
  disabled: () =>
    new SpellError("TORE Spell is not available.", "SPELL_DISABLED", 404),
  notConfigured: () =>
    new SpellError(
      "TORE Spell is not configured.",
      "SPELL_NOT_CONFIGURED",
      503,
    ),
  /** Unknown, malformed and bad-checksum codes are indistinguishable on purpose. */
  codeInvalid: () =>
    new SpellError("License code is not valid.", "LICENSE_CODE_INVALID", 404),
  licenseRevoked: () =>
    new SpellError("This license has been revoked.", "LICENSE_REVOKED", 403),
  licenseExpired: () =>
    new SpellError("This license has expired.", "LICENSE_EXPIRED", 403),
  redeemWindowClosed: () =>
    new SpellError(
      "This license was not activated before its redeem-by date.",
      "LICENSE_REDEEM_WINDOW_CLOSED",
      403,
    ),
  transferConfirmationRequired: (details: Record<string, unknown>) =>
    new SpellError(
      "This license is active on another computer. Confirmation is required to transfer it.",
      "TRANSFER_CONFIRMATION_REQUIRED",
      409,
      details,
    ),
  transferCooldownActive: (availableAt: Date) =>
    new SpellError(
      "This license was moved recently and cannot be moved again yet.",
      "TRANSFER_COOLDOWN_ACTIVE",
      403,
      { transferAvailableAt: availableAt.toISOString() },
    ),
  activationNotActive: (details?: Record<string, unknown>) =>
    new SpellError(
      "This computer no longer holds an active activation for the license.",
      "ACTIVATION_NOT_ACTIVE",
      403,
      details,
    ),
  installationRevoked: () =>
    new SpellError("This installation has been revoked.", "INSTALLATION_REVOKED", 403),
  installationUnknown: () =>
    new SpellError("This installation is not registered.", "INSTALLATION_UNKNOWN", 401),
  signatureInvalid: () =>
    new SpellError("Request signature is invalid.", "REQUEST_SIGNATURE_INVALID", 401),
  timestampInvalid: () =>
    new SpellError("Request timestamp is outside the allowed window.", "REQUEST_TIMESTAMP_INVALID", 401),
  replayed: () =>
    new SpellError("Request was already processed.", "REQUEST_REPLAYED", 401),
  tooManyAttempts: (retryAfterSeconds: number) =>
    new SpellError(
      "Too many failed attempts. Try again later.",
      "TOO_MANY_ATTEMPTS",
      429,
      { retryAfterSeconds },
    ),
  activationConflict: () =>
    new SpellError(
      "The license is being changed by another request. Please retry.",
      "ACTIVATION_CONFLICT",
      409,
    ),
};
