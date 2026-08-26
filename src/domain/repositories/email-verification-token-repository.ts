export type EmailVerificationToken = {
  identifier: string;
  /** SHA-256 hex digest of the raw token sent to the user. */
  tokenHash: string;
  expires: Date;
};

export type CreateEmailVerificationTokenInput = {
  identifier: string;
  tokenHash: string;
  expires: Date;
};

export interface EmailVerificationTokenRepository {
  /** Replace any existing tokens for this identifier (email). */
  replaceForIdentifier(
    input: CreateEmailVerificationTokenInput,
  ): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null>;
  findByIdentifier(identifier: string): Promise<EmailVerificationToken | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  deleteForIdentifier(identifier: string): Promise<void>;
}
