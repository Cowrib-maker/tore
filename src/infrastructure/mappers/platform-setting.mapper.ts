import type { PlatformSetting } from "@/domain/entities/platform-setting";

type PlatformSettingRecord = {
  key: string;
  value: string;
  description: string | null;
  updatedAt: Date;
};

export function mapPlatformSetting(record: PlatformSettingRecord): PlatformSetting {
  return {
    key: record.key,
    value: record.value,
    description: record.description,
    updatedAt: record.updatedAt,
  };
}
