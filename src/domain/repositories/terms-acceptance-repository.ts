import type {
  AcceptTermsInput,
  TermsAcceptance,
  TermsBundleInput,
} from "@/domain/entities/terms-acceptance";
import type { TermsType } from "@/domain/enums";

export interface TermsAcceptanceRepository {
  create(input: AcceptTermsInput): Promise<TermsAcceptance>;
  createBundle(input: TermsBundleInput): Promise<TermsAcceptance[]>;
  hasAccepted(
    userId: string,
    termsType: TermsType,
    termsVersion: string,
  ): Promise<boolean>;
}
