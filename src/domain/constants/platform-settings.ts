/** Stable keys for platform_settings rows used by domain services. */
export const PLATFORM_SETTING_KEYS = {
  TERMS_VERSION: "terms_version",
  PRIVACY_VERSION: "privacy_version",
  MARKETPLACE_DISCLAIMER_VERSION: "marketplace_disclaimer_version",
  PLATFORM_FEE_PERCENT: "platform_fee_percent",
  BOOKING_NUMBER_PREFIX: "booking_number_prefix",
  SUPPORT_EMAIL: "support_email",
  SESSION_PROTECTION_POLICY: "session_protection_policy",
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];
