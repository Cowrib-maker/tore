/** Mongolian display order: family name (овог) then given name (нэр). */
export function splitDisplayName(name: string | null | undefined): {
  lastName: string;
  firstName: string;
} {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) {
    return { lastName: "", firstName: "" };
  }
  const space = trimmed.indexOf(" ");
  if (space === -1) {
    return { lastName: "", firstName: trimmed };
  }
  return {
    lastName: trimmed.slice(0, space).trim(),
    firstName: trimmed.slice(space + 1).trim(),
  };
}

export function joinDisplayName(lastName: string, firstName: string): string {
  return [lastName.trim(), firstName.trim()].filter(Boolean).join(" ");
}
