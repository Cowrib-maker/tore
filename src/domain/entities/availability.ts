import type { DayOfWeek } from "@/domain/enums";
import type { DateOnly, TimeOnly } from "@/domain/value-objects/time-slot";

export interface AvailabilityRule {
  id: string;
  lawyerProfileId: string;
  dayOfWeek: DayOfWeek;
  startTime: TimeOnly;
  endTime: TimeOnly;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AvailabilityException {
  id: string;
  lawyerProfileId: string;
  exceptionDate: DateOnly;
  startTime: TimeOnly | null;
  endTime: TimeOnly | null;
  isAvailable: boolean;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAvailabilityRuleInput {
  lawyerProfileId: string;
  dayOfWeek: DayOfWeek;
  startTime: TimeOnly;
  endTime: TimeOnly;
}

export interface CreateAvailabilityExceptionInput {
  lawyerProfileId: string;
  exceptionDate: DateOnly;
  startTime?: TimeOnly;
  endTime?: TimeOnly;
  isAvailable?: boolean;
  reason?: string;
}

export interface UpdateAvailabilityRuleInput {
  startTime?: TimeOnly;
  endTime?: TimeOnly;
  isActive?: boolean;
}
