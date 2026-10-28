import type { SpellRepositories, SpellUnitOfWork } from "@/domain/ports/spell-unit-of-work";
import type { SpellCodeVault, SpellTokenIssuer } from "@/domain/ports/spell-security";
import type {
  SpellAttemptRepository,
  SpellNonceRepository,
} from "@/domain/repositories/spell-guard-repository";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import type { SpellPolicy } from "@/domain/spell/policy";

export type SpellDeps = {
  /** Atomic, SERIALIZABLE, retried — all Spell state changes go through this. */
  unitOfWork: SpellUnitOfWork;
  /** Non-transactional reads (listings). Never used to decide a state change. */
  repos: SpellRepositories;
  attemptRepository: SpellAttemptRepository;
  nonceRepository: SpellNonceRepository;
  vault: SpellCodeVault;
  tokenIssuer: SpellTokenIssuer;
  policy: SpellPolicy;
};

export type SpellAdminDeps = SpellDeps & {
  userRepository: Pick<UserRepository, "findById">;
  auditLogRepository: Pick<AuditLogRepository, "create">;
  /** Injected for deterministic tests; defaults to node:crypto in the composition root. */
  randomBytes: (size: number) => Uint8Array;
};
