import type { PlatformSetting } from "@/domain/entities/platform-setting";
import type { PlatformSettingRepository } from "@/domain/repositories/platform-setting-repository";
import { mapPlatformSetting } from "@/infrastructure/mappers/platform-setting.mapper";
import { prisma } from "@/infrastructure/database/prisma";

export class PrismaPlatformSettingRepository implements PlatformSettingRepository {
  async findByKey(key: string): Promise<PlatformSetting | null> {
    const record = await prisma.platformSetting.findUnique({ where: { key } });
    return record ? mapPlatformSetting(record) : null;
  }

  async findMany(keys: string[]): Promise<PlatformSetting[]> {
    const records = await prisma.platformSetting.findMany({
      where: { key: { in: keys } },
    });
    return records.map(mapPlatformSetting);
  }

  async findAll(): Promise<PlatformSetting[]> {
    const records = await prisma.platformSetting.findMany({
      orderBy: { key: "asc" },
    });
    return records.map(mapPlatformSetting);
  }

  async updateValue(
    key: string,
    value: string,
    updatedByUserId?: string,
  ): Promise<PlatformSetting> {
    const record = await prisma.platformSetting.update({
      where: { key },
      data: {
        value,
        ...(updatedByUserId ? { updatedByUserId } : {}),
      },
    });
    return mapPlatformSetting(record);
  }
}

export const platformSettingRepository = new PrismaPlatformSettingRepository();
