import type {
  ClientProfile,
  CreateClientProfileInput,
  LawyerCredential,
  LawyerProfile,
  CreateLawyerProfileInput,
  ReviewLawyerCredentialInput,
  SubmitLawyerCredentialInput,
  UpdateClientProfileInput,
  UpdateLawyerProfileInput,
} from "@/domain/entities/profile";
import type { LawyerVerificationStatus } from "@/domain/enums";
import type { ListPage, ListPageOptions } from "@/application/common/list-page";

export interface ClientProfileRepository {
  findById(id: string): Promise<ClientProfile | null>;
  findByUserId(userId: string): Promise<ClientProfile | null>;
  create(input: CreateClientProfileInput): Promise<ClientProfile>;
  update(id: string, input: UpdateClientProfileInput): Promise<ClientProfile>;
}

export interface LawyerProfileRepository {
  findById(id: string): Promise<LawyerProfile | null>;
  findByUserId(userId: string): Promise<LawyerProfile | null>;
  findBySlug(slug: string): Promise<LawyerProfile | null>;
  slugExists(slug: string): Promise<boolean>;
  hasActiveOffering(lawyerProfileId: string): Promise<boolean>;
  create(input: CreateLawyerProfileInput): Promise<LawyerProfile>;
  update(id: string, input: UpdateLawyerProfileInput): Promise<LawyerProfile>;
  updateVerificationStatus(
    id: string,
    status: LawyerVerificationStatus,
    verifiedAt?: Date,
  ): Promise<LawyerProfile>;
  updateRatingAggregate(
    id: string,
    averageRating: number,
    reviewCount: number,
  ): Promise<LawyerProfile>;
  findListed(filters?: LawyerDiscoveryFilters): Promise<LawyerProfile[]>;
}

export interface LawyerDiscoveryFilters {
  practiceAreaId?: string;
  languageId?: string;
  minRating?: number;
  city?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface LawyerCredentialRepository {
  findById(id: string): Promise<LawyerCredential | null>;
  findByLawyerProfileId(lawyerProfileId: string): Promise<LawyerCredential[]>;
  findPendingReview(options?: ListPageOptions): Promise<ListPage<LawyerCredential>>;
  create(input: SubmitLawyerCredentialInput): Promise<LawyerCredential>;
  review(id: string, input: ReviewLawyerCredentialInput): Promise<LawyerCredential>;
}
