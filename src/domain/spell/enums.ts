/**
 * TORE Spell licensing enums. Kept inside the Spell bounded context (not the
 * shared `domain/enums`) so the subsystem stays removable and reviewable on
 * its own. String values mirror the Prisma enums 1:1.
 */

export enum SpellProduct {
  TORE_SPELL = "TORE_SPELL",
}

export enum SpellPlanCode {
  SPELL_1M = "SPELL_1M",
  SPELL_3M = "SPELL_3M",
  SPELL_6M = "SPELL_6M",
  SPELL_12M = "SPELL_12M",
}

export enum SpellLicenseSource {
  ADMIN_ISSUED = "ADMIN_ISSUED",
  PURCHASE = "PURCHASE",
  PROMO = "PROMO",
}

/** Persisted license status. EXPIRED is never stored — see `deriveLicenseState`. */
export enum SpellLicenseStatus {
  ACTIVE = "ACTIVE",
  REVOKED = "REVOKED",
}

/** What callers see: persisted status combined with server time. */
export enum SpellEffectiveLicenseStatus {
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED",
  REVOKED = "REVOKED",
}

export enum SpellActivationStatus {
  ACTIVE = "ACTIVE",
  DEACTIVATED = "DEACTIVATED",
  REVOKED = "REVOKED",
}

export enum SpellActivationEndReason {
  TRANSFERRED = "TRANSFERRED",
  USER_DEACTIVATED = "USER_DEACTIVATED",
  ADMIN_DEACTIVATED = "ADMIN_DEACTIVATED",
  LICENSE_REVOKED = "LICENSE_REVOKED",
  INSTALLATION_REVOKED = "INSTALLATION_REVOKED",
}

export enum SpellPlatform {
  WINDOWS = "WINDOWS",
  MACOS = "MACOS",
}

export enum SpellEventType {
  LICENSE_ISSUED = "LICENSE_ISSUED",
  LICENSE_REVOKED = "LICENSE_REVOKED",
  LICENSE_CODE_REVEALED = "LICENSE_CODE_REVEALED",
  LICENSE_FIRST_ACTIVATED = "LICENSE_FIRST_ACTIVATED",
  ACTIVATION_CREATED = "ACTIVATION_CREATED",
  ACTIVATION_TRANSFERRED = "ACTIVATION_TRANSFERRED",
  ACTIVATION_DEACTIVATED = "ACTIVATION_DEACTIVATED",
  ACTIVATION_REVOKED = "ACTIVATION_REVOKED",
  TRANSFER_COOLDOWN_OVERRIDDEN = "TRANSFER_COOLDOWN_OVERRIDDEN",
}

export enum SpellActorType {
  SYSTEM = "SYSTEM",
  USER = "USER",
  ADMIN = "ADMIN",
  DEVICE = "DEVICE",
}

export enum SpellAttemptKind {
  ACTIVATE = "ACTIVATE",
  VALIDATE = "VALIDATE",
  DEACTIVATE = "DEACTIVATE",
}

export enum SpellAttemptOutcome {
  SUCCESS = "SUCCESS",
  INVALID_CODE = "INVALID_CODE",
  SIGNATURE_INVALID = "SIGNATURE_INVALID",
  STALE_TIMESTAMP = "STALE_TIMESTAMP",
  REPLAY = "REPLAY",
  LICENSE_REJECTED = "LICENSE_REJECTED",
  TRANSFER_BLOCKED = "TRANSFER_BLOCKED",
  ACTIVATION_REJECTED = "ACTIVATION_REJECTED",
  RATE_LIMITED = "RATE_LIMITED",
}
