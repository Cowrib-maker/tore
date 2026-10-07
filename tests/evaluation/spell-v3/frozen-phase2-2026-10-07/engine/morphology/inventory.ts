import { NOUN_CASE, NOUN_PLURAL, REFLEXIVE_AFTER_CONSONANT, REFLEXIVE_AFTER_GENITIVE, REFLEXIVE_AFTER_VOWEL, VERB_GROUPS } from "./suffixes";

/** Surface strings of the inflectional suffix tables (grammar data), for tools and boundary diagnostics. */
export function nounSuffixSurfaces(): string[] {
  const out = new Set<string>();
  const add = (x: string | null) => x && out.add(x);
  for (const vs of Object.values(NOUN_PLURAL)) for (const v of vs) (add(v.M), add(v.F));
  for (const gs of Object.values(NOUN_CASE)) for (const g of gs) for (const v of g.variants) (add(v.M), add(v.F));
  for (const v of [...REFLEXIVE_AFTER_CONSONANT, ...REFLEXIVE_AFTER_VOWEL, ...REFLEXIVE_AFTER_GENITIVE]) (add(v.M), add(v.F));
  return [...out];
}

export function verbSuffixSurfaces(): string[] {
  const out = new Set<string>();
  for (const g of VERB_GROUPS) for (const v of [...g.afterC, ...g.afterV]) for (const x of [v.M, v.F]) if (x) out.add(x.replace("~", ""));
  return [...out];
}
