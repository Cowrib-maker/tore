/**
 * TORE Spell update metadata (V1 = MANUAL update architecture).
 *
 * What exists: the server publishes a SIGNED description of the latest Windows release (version, https installer URL, SHA-256, size, minimum
 * supported version); the desktop app verifies the signature against the public keys compiled into it, compares versions, and tells the user
 * that an update exists — then sends them to the licence page to download. The app NEVER downloads or runs an installer by itself.
 * What does NOT exist (REQUIRES PRODUCTION CONFIGURATION): hosting for the installer, a code-signing certificate, and therefore automatic
 * download + install. Do not add either without a signed installer, a verified hash and a rollback plan; user data (licence, personal
 * dictionary, device identity) lives in the OS user-data directory and is never touched by an installer upgrade (appId and
 * deleteAppDataOnUninstall=false are tested).
 */
export const SPELL_RELEASE_TOKEN_TYPE = "tore-spell-release+jwt";
export const SPELL_RELEASE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export const SPELL_RELEASE_ENV = {
  version: "SPELL_RELEASE_VERSION",
  installerUrl: "SPELL_WINDOWS_INSTALLER_URL",
  sha256: "SPELL_WINDOWS_INSTALLER_SHA256",
  size: "SPELL_WINDOWS_INSTALLER_SIZE",
  minVersion: "SPELL_MIN_SUPPORTED_VERSION",
} as const;

export type SpellRelease = { version: string; url: string; sha256: string; size: number | null; minSupportedVersion: string | null };

const SEMVER = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:-([0-9A-Za-z.-]{1,32}))?$/;

export type ParsedVersion = { major: number; minor: number; patch: number; pre: string | null };

export function parseVersion(v: string): ParsedVersion | null {
  const m = SEMVER.exec(v.trim());
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ?? null } : null;
}

/** Semantic-version order; a pre-release sorts BEFORE its release (1.0.0-alpha.2 < 1.0.0). Returns null if either side is not a version. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (const k of ["major", "minor", "patch"] as const) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  const px = x.pre.split(".");
  const py = y.pre.split(".");
  for (let i = 0; i < Math.max(px.length, py.length); i += 1) {
    const l = px[i];
    const r = py[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const ln = /^\d+$/.test(l);
    const rn = /^\d+$/.test(r);
    if (ln && rn) {
      if (Number(l) !== Number(r)) return Number(l) < Number(r) ? -1 : 1;
    } else if (ln !== rn) return ln ? -1 : 1;
    else if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}

/** The configured latest release, or null when ANY required part is missing or malformed (never a guessed URL or hash). */
export function getSpellRelease(env: Record<string, string | undefined> = process.env): SpellRelease | null {
  const version = env[SPELL_RELEASE_ENV.version]?.trim();
  const url = env[SPELL_RELEASE_ENV.installerUrl]?.trim();
  const sha256 = env[SPELL_RELEASE_ENV.sha256]?.trim().toLowerCase();
  if (!version || !parseVersion(version) || !url || !sha256 || !/^[a-f0-9]{64}$/.test(sha256)) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  const sizeRaw = env[SPELL_RELEASE_ENV.size]?.trim();
  const size = sizeRaw && /^\d{1,12}$/.test(sizeRaw) ? Number(sizeRaw) : null;
  const min = env[SPELL_RELEASE_ENV.minVersion]?.trim();
  return { version, url, sha256, size, minSupportedVersion: min && parseVersion(min) ? min : null };
}
