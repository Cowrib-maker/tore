import type { PlatformSetting } from "@/domain/entities/platform-setting";

export interface PlatformSettingRepository {
  findByKey(key: string): Promise<PlatformSetting | null>;
  findMany(keys: string[]): Promise<PlatformSetting[]>;
  findAll(): Promise<PlatformSetting[]>;
  updateValue(
    key: string,
    value: string,
    updatedByUserId?: string,
  ): Promise<PlatformSetting>;
}
