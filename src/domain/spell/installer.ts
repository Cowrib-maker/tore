/**
 * Where the Windows beta installer is published. Configuration, never a
 * guess: set `SPELL_WINDOWS_INSTALLER_URL` to the https URL of the release
 * artifact produced by the Windows CI workflow (e.g. a GitHub release asset).
 * Unset/invalid → the product says «Beta installer удахгүй» and offers no link.
 */
export const SPELL_INSTALLER_URL_ENV = "SPELL_WINDOWS_INSTALLER_URL";

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
