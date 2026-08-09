const SLUG_MAX_LENGTH = 64;

export function slugifyDisplayName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!base) {
    return "lawyer";
  }

  return base.slice(0, SLUG_MAX_LENGTH);
}

export function buildLawyerSlugCandidate(name: string, suffix: string): string {
  const base = slugifyDisplayName(name);
  const candidate = `${base}-${suffix}`.slice(0, SLUG_MAX_LENGTH);
  return candidate.replace(/-+$/g, "") || "lawyer";
}

export function generateSlugSuffix(length = 6): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";

  for (let i = 0; i < length; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return suffix;
}

export function generateLawyerSlug(name: string): string {
  return buildLawyerSlugCandidate(name, generateSlugSuffix());
}
