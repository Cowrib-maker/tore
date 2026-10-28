import type {
  SpellActivationEndReason,
  SpellActivationStatus,
  SpellActorType,
  SpellAttemptKind,
  SpellAttemptOutcome,
  SpellEventType,
  SpellLicenseSource,
  SpellLicenseStatus,
  SpellPlanCode,
  SpellPlatform,
  SpellProduct,
} from "./enums";

export interface SpellLicense {
  id: string;
  product: SpellProduct;
  planCode: SpellPlanCode;
  durationMonths: number;
  source: SpellLicenseSource;
  status: SpellLicenseStatus;
  ownerUserId: string | null;
  /** HMAC of the canonical code; lookup only. */
  codeHash: string;
  codeHashKeyId: string;
  /** AES-256-GCM envelope (iv || tag || ciphertext) for owner reveal. */
  codeCiphertext: Uint8Array;
  /** Which encryption key produced `codeCiphertext` (enables rotation). */
  codeEncKeyVersion: string;
  /** Last four characters of the canonical code, for display. */
  codeHint: string;
  redeemBy: Date;
  /** Set at first activation; null while unredeemed. */
  startsAt: Date | null;
  expiresAt: Date | null;
  /** Last time the license moved to a different installation. */
  lastDeviceChangeAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  issuedByUserId: string | null;
  /** Paying invoice for a PURCHASE licence (unique: one licence per payment). */
  purchaseInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpellInstallation {
  id: string;
  /** base64url(SHA-256(raw Ed25519 public key)). */
  keyThumbprint: string;
  /** base64url raw 32-byte Ed25519 public key. */
  publicKey: string;
  platform: SpellPlatform;
  appVersion: string;
  /** HMAC of a coarse client-supplied machine hint. Soft signal only. */
  machineHintHash: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

export interface SpellActivation {
  id: string;
  licenseId: string;
  installationId: string;
  userId: string | null;
  status: SpellActivationStatus;
  endReason: SpellActivationEndReason | null;
  activatedAt: Date;
  lastValidatedAt: Date;
  deactivatedAt: Date | null;
  supersededByActivationId: string | null;
  transferredFromActivationId: string | null;
  lastTokenJti: string | null;
  createdAt: Date;
}

export interface SpellLicenseEvent {
  id: string;
  licenseId: string;
  activationId: string | null;
  type: SpellEventType;
  actorType: SpellActorType;
  actorUserId: string | null;
  ipHash: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface SpellAttempt {
  id: string;
  kind: SpellAttemptKind;
  outcome: SpellAttemptOutcome;
  ipHash: string | null;
  installationThumbprint: string | null;
  licenseId: string | null;
  createdAt: Date;
}
