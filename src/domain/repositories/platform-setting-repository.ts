import type { PlatformSetting } from "@/domain/entities/platform-setting";

export interface PlatformSettingRepository {
  findByKey(key: string): Promise<PlatformSetting | null>;
  findMany(keys: string[]): Promise<PlatformSetting[]>;
}
