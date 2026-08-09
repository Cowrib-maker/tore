import type { TermsType } from "@/domain/enums";

export interface TermsAcceptance {
  id: string;
  userId: string;
  termsType: TermsType;
  termsVersion: string;
  acceptedAt: Date;
  ipAddress: string | null;
}

export interface AcceptTermsInput {
  userId: string;
  termsType: TermsType;
  termsVersion: string;
  ipAddress?: string;
}

export interface TermsBundleInput {
  userId: string;
  termsVersion: string;
  privacyVersion: string;
  marketplaceDisclaimerVersion: string;
  ipAddress?: string;
}
