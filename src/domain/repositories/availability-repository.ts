import type {
  AvailabilityException,
  AvailabilityRule,
  CreateAvailabilityExceptionInput,
  CreateAvailabilityRuleInput,
  UpdateAvailabilityRuleInput,
} from "@/domain/entities/availability";
import type { DateOnly } from "@/domain/value-objects/time-slot";

export interface AvailabilityRepository {
  findRulesByLawyerProfileId(lawyerProfileId: string): Promise<AvailabilityRule[]>;
  findActiveRulesByLawyerProfileId(
    lawyerProfileId: string,
  ): Promise<AvailabilityRule[]>;
  findExceptionsByLawyerProfileId(
    lawyerProfileId: string,
    fromDate: DateOnly,
    toDate: DateOnly,
  ): Promise<AvailabilityException[]>;
  createRule(input: CreateAvailabilityRuleInput): Promise<AvailabilityRule>;
  updateRule(
    id: string,
    input: UpdateAvailabilityRuleInput,
  ): Promise<AvailabilityRule>;
  deleteRule(id: string): Promise<void>;
  createException(
    input: CreateAvailabilityExceptionInput,
  ): Promise<AvailabilityException>;
  deleteException(id: string): Promise<void>;
}
