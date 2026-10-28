import type { SpellAttempt } from "@/domain/spell/entities";
import type { SpellAttemptKind, SpellAttemptOutcome } from "@/domain/spell/enums";

export type RecordSpellAttemptInput = {
  kind: SpellAttemptKind;
  outcome: SpellAttemptOutcome;
  ipHash?: string | null;
  installationThumbprint?: string | null;
  licenseId?: string | null;
  at: Date;
};

/** Brute-force counters. Short retention; not an audit trail. */
export interface SpellAttemptRepository {
  record(input: RecordSpellAttemptInput): Promise<SpellAttempt>;
  countFailedCodeAttempts(input: {
    ipHash?: string | null;
    installationThumbprint?: string | null;
    since: Date;
  }): Promise<{ byIp: number; byInstallation: number }>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}

/** Replay protection for signed device requests. */
export interface SpellNonceRepository {
  /** Returns false when the nonce was already used (replay). */
  tryConsume(input: {
    installationThumbprint: string;
    nonce: string;
    expiresAt: Date;
  }): Promise<boolean>;
  deleteExpired(now: Date): Promise<number>;
}
