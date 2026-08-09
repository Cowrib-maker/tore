import type { TermsAcceptance } from "@/domain/entities/terms-acceptance";
import type { TermsType } from "@/domain/enums";

type TermsAcceptanceRecord = {
  id: string;
  userId: string;
  termsType: string;
  termsVersion: string;
  acceptedAt: Date;
  ipAddress: string | null;
};

export function mapTermsAcceptance(record: TermsAcceptanceRecord): TermsAcceptance {
  return {
    id: record.id,
    userId: record.userId,
    termsType: record.termsType as TermsType,
    termsVersion: record.termsVersion,
    acceptedAt: record.acceptedAt,
    ipAddress: record.ipAddress,
  };
}
