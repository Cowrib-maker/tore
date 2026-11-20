import { DomainError } from "@/domain/errors/domain-error";
import {
  SpellAttemptKind,
  SpellAttemptOutcome,
} from "@/domain/spell/enums";
import type { SpellAttemptRepository } from "@/domain/repositories/spell-guard-repository";

const OUTCOME_BY_ERROR_CODE: Record<string, SpellAttemptOutcome> = {
  LICENSE_CODE_INVALID: SpellAttemptOutcome.INVALID_CODE,
  LICENSE_REVOKED: SpellAttemptOutcome.LICENSE_REJECTED,
  LICENSE_EXPIRED: SpellAttemptOutcome.LICENSE_REJECTED,
  LICENSE_REDEEM_WINDOW_CLOSED: SpellAttemptOutcome.LICENSE_REJECTED,
  TRANSFER_COOLDOWN_ACTIVE: SpellAttemptOutcome.TRANSFER_BLOCKED,
  TRANSFER_CONFIRMATION_REQUIRED: SpellAttemptOutcome.ACTIVATION_REJECTED,
  ACTIVATION_NOT_ACTIVE: SpellAttemptOutcome.ACTIVATION_REJECTED,
  INSTALLATION_REVOKED: SpellAttemptOutcome.ACTIVATION_REJECTED,
  TOO_MANY_ATTEMPTS: SpellAttemptOutcome.RATE_LIMITED,
  REQUEST_SIGNATURE_INVALID: SpellAttemptOutcome.SIGNATURE_INVALID,
  REQUEST_TIMESTAMP_INVALID: SpellAttemptOutcome.STALE_TIMESTAMP,
  REQUEST_REPLAYED: SpellAttemptOutcome.REPLAY,
};

/**
 * Persist the outcome of a device request OUTSIDE the state-changing
 * transaction, so a rejected request is still counted even though its
 * transaction rolled back. Counting failures must never mask the original
 * error, so recording problems are logged (without request data) and dropped.
 */
export async function recordAttemptForError(
  attempts: SpellAttemptRepository,
  base: {
    kind: SpellAttemptKind;
    ipHash: string | null;
    installationThumbprint: string | null;
    licenseId?: string | null;
    at: Date;
  },
  error: unknown,
): Promise<void> {
  if (!(error instanceof DomainError)) return;
  const outcome = OUTCOME_BY_ERROR_CODE[error.code];
  if (!outcome) return;
  await safeRecord(attempts, { ...base, outcome });
}

export async function recordAttemptSuccess(
  attempts: SpellAttemptRepository,
  base: {
    kind: SpellAttemptKind;
    ipHash: string | null;
    installationThumbprint: string | null;
    licenseId?: string | null;
    at: Date;
  },
): Promise<void> {
  await safeRecord(attempts, { ...base, outcome: SpellAttemptOutcome.SUCCESS });
}

async function safeRecord(
  attempts: SpellAttemptRepository,
  input: Parameters<SpellAttemptRepository["record"]>[0],
): Promise<void> {
  try {
    await attempts.record(input);
  } catch {
    console.error("[spell] failed to record attempt");
  }
}
