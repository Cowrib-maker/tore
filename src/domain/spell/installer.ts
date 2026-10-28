/**
 * Where the Windows installer is published. Configuration, never a guess.
 *
 * Two delivery modes, in order of preference:
 *  1. PRIVATE (recommended): `SPELL_INSTALLER_STORAGE_KEY` names an object in the private S3 bucket. Only a signed-in owner of a LIVE licence is
 *     given a short-lived signed URL (see /api/spell/download); the object is never publicly readable.
 *  2. PUBLIC URL (opt-in in production): `SPELL_WINDOWS_INSTALLER_URL` is an https URL of the release artifact. The licence check still gates
 *     the page and the route, but anyone who learns that URL can download the installer (the application itself stays locked without a
 *     licence). Production ignores it unless `TORE_ALLOW_PUBLIC_SPELL_INSTALLER=1`; it is never a silent fallback for a private key.
 * Neither configured/valid → the product says «Beta installer удахгүй» and offers no link.
 */
export const SPELL_INSTALLER_URL_ENV = "SPELL_WINDOWS_INSTALLER_URL";
export const SPELL_INSTALLER_STORAGE_KEY_ENV = "SPELL_INSTALLER_STORAGE_KEY";
export const SPELL_INSTALLER_KEY_PREFIX = "spell-installer/";

export function getSpellInstallerUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env[SPELL_INSTALLER_URL_ENV]?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A storage key under `spell-installer/`: safe characters only, no traversal. Anything else is treated as not configured. */
export function getSpellInstallerStorageKey(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env[SPELL_INSTALLER_STORAGE_KEY_ENV]?.trim();
  if (!raw || !raw.startsWith(SPELL_INSTALLER_KEY_PREFIX) || raw.length > 200) return null;
  if (!/^[A-Za-z0-9._\-/]+$/.test(raw) || raw.includes("..") || raw.includes("//") || raw.endsWith("/")) return null;
  return raw;
}

export type SpellInstallerSource = { kind: "storage"; key: string } | { kind: "url"; url: string };

/** Production honours a PUBLIC installer URL only when the operator has explicitly accepted that trade-off (same TORE_ALLOW_* convention as the other production guards). */
export const SPELL_ALLOW_PUBLIC_INSTALLER_ENV = "TORE_ALLOW_PUBLIC_SPELL_INSTALLER";

/**
 * Chooses where the installer comes from — and, just as important, when it must NOT be served at all.
 *  - If a private key is requested (`SPELL_INSTALLER_STORAGE_KEY` is non-empty) the answer is that key or NOTHING. A mistyped key, or a
 *    storage backend that is not S3, never degrades to the public URL: the download is unavailable until the configuration is fixed.
 *  - A public URL is used only when no private key was requested and, in production, only with TORE_ALLOW_PUBLIC_SPELL_INSTALLER=1.
 * `s3Available` is whether the app's file storage is S3 (a local-disk key can never be served safely).
 */
export function getSpellInstallerSource(
  env: Record<string, string | undefined> = process.env,
  s3Available = true,
): SpellInstallerSource | null {
  if (env[SPELL_INSTALLER_STORAGE_KEY_ENV]?.trim()) {
    const key = getSpellInstallerStorageKey(env);
    return key && s3Available ? { kind: "storage", key } : null;
  }
  const url = getSpellInstallerUrl(env);
  if (!url) return null;
  if (env.NODE_ENV === "production" && env[SPELL_ALLOW_PUBLIC_INSTALLER_ENV] !== "1") return null;
  return { kind: "url", url };
}
