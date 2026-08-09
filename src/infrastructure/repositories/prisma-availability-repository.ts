import type {
  AvailabilityException,
  AvailabilityRule,
  CreateAvailabilityExceptionInput,
  CreateAvailabilityRuleInput,
  UpdateAvailabilityRuleInput,
} from "@/domain/entities/availability";
import type { AvailabilityRepository } from "@/domain/repositories/availability-repository";
import type { DateOnly } from "@/domain/value-objects/time-slot";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import {
  dateOnlyToDate,
  mapAvailabilityException,
  mapAvailabilityRule,
  timeOnlyToDate,
} from "@/infrastructure/mappers/availability.mapper";

const ruleSelect = {
  id: true,
  lawyerProfileId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const exceptionSelect = {
  id: true,
  lawyerProfileId: true,
  exceptionDate: true,
  startTime: true,
  endTime: true,
  isAvailable: true,
  reason: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class PrismaAvailabilityRepository implements AvailabilityRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findRulesByLawyerProfileId(
    lawyerProfileId: string,
  ): Promise<AvailabilityRule[]> {
    const records = await this.db.availabilityRule.findMany({
      where: { lawyerProfileId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      select: ruleSelect,
    });
    return records.map(mapAvailabilityRule);
  }

  async findActiveRulesByLawyerProfileId(
    lawyerProfileId: string,
  ): Promise<AvailabilityRule[]> {
    const records = await this.db.availabilityRule.findMany({
      where: { lawyerProfileId, isActive: true },
      select: ruleSelect,
    });
    return records.map(mapAvailabilityRule);
  }

  async findExceptionsByLawyerProfileId(
    lawyerProfileId: string,
    fromDate: DateOnly,
    toDate: DateOnly,
  ): Promise<AvailabilityException[]> {
    const records = await this.db.availabilityException.findMany({
      where: {
        lawyerProfileId,
        exceptionDate: {
          gte: dateOnlyToDate(fromDate),
          lte: dateOnlyToDate(toDate),
        },
      },
      select: exceptionSelect,
    });
    return records.map(mapAvailabilityException);
  }

  async createRule(
    input: CreateAvailabilityRuleInput,
  ): Promise<AvailabilityRule> {
    const record = await this.db.availabilityRule.create({
      data: {
        lawyerProfileId: input.lawyerProfileId,
        dayOfWeek: input.dayOfWeek,
        startTime: timeOnlyToDate(input.startTime),
        endTime: timeOnlyToDate(input.endTime),
        isActive: true,
      },
      select: ruleSelect,
    });
    return mapAvailabilityRule(record);
  }

  async updateRule(
    id: string,
    input: UpdateAvailabilityRuleInput,
  ): Promise<AvailabilityRule> {
    const record = await this.db.availabilityRule.update({
      where: { id },
      data: {
        startTime: input.startTime
          ? timeOnlyToDate(input.startTime)
          : undefined,
        endTime: input.endTime ? timeOnlyToDate(input.endTime) : undefined,
        isActive: input.isActive,
      },
      select: ruleSelect,
    });
    return mapAvailabilityRule(record);
  }

  async deleteRule(id: string): Promise<void> {
    await this.db.availabilityRule.delete({ where: { id } });
  }

  async createException(
    input: CreateAvailabilityExceptionInput,
  ): Promise<AvailabilityException> {
    const record = await this.db.availabilityException.create({
      data: {
        lawyerProfileId: input.lawyerProfileId,
        exceptionDate: dateOnlyToDate(input.exceptionDate),
        startTime: input.startTime
          ? timeOnlyToDate(input.startTime)
          : null,
        endTime: input.endTime ? timeOnlyToDate(input.endTime) : null,
        isAvailable: input.isAvailable ?? false,
        reason: input.reason,
      },
      select: exceptionSelect,
    });
    return mapAvailabilityException(record);
  }

  async deleteException(id: string): Promise<void> {
    await this.db.availabilityException.delete({ where: { id } });
  }
}

export const availabilityRepository = new PrismaAvailabilityRepository();
