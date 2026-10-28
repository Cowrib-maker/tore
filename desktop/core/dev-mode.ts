import type { LicenseState } from "./license-client";

/**
 * Developer conveniences. They exist ONLY in a development build:
 * `__TORE_ENV__` is a compile-time constant, so in a release build the branch
 * that calls this module is dead code and is removed by the bundler; the
 * package verifier then fails the build if any trace remains.
 */
export type DevOptions = {
  /** Skip the licence gate (no server needed) — a stand-in for a deterministic dev licence. */
  devLicense: boolean;
  /** Folder with a local research dictionary (class C data; never shipped). */
  researchDir?: string;
  /** Optional local frequency table (class D derived; never shipped). */
  frequencyFile?: string;
};

export const NO_DEV: DevOptions = { devLicense: false };

export function devOptionsFromEnv(env: Record<string, string | undefined>): DevOptions {
  return {
    devLicense: env.TORE_SPELL_DEV_LICENSE === "1",
    researchDir: env.TORE_SPELL_RESEARCH_DIR || undefined,
    frequencyFile: env.TORE_SPELL_RESEARCH_FREQ || undefined,
  };
}

/** Clearly synthetic: plan "DEV", labelled as such in the UI. */
export const DEV_LICENSE_STATE: LicenseState = {
  kind: "ACTIVE",
  planCode: "DEV",
  licenseExpiresAt: "2099-12-31T00:00:00.000Z",
  offlineUntil: "2099-12-31T00:00:00.000Z",
  refreshDue: false,
};
