import { packsAtTier, type DataPack, type DataTier } from "./lexicon/pack-schema";
import { SpellEngineV1, type SpellEngineConfig, type TypoPair } from "./core/engine";
import { ALL_PACKS } from "./data/packs";
import typoPairs from "./data/packs/typo-pairs.json";

/** TORE-owned, redistributable packs shipped with the engine. */
export const BUNDLED_PACKS: readonly DataPack[] = ALL_PACKS;

export const BUNDLED_TYPO_PAIRS: readonly TypoPair[] = (typoPairs as { pairs: TypoPair[] }).pairs;

/**
 * `minTier`: load only packs whose content tier is at least this (REVIEWED > TRUSTED > PROVISIONAL; REJECTED never). The default
 * (PROVISIONAL) is the product configuration; `TRUSTED` is the RELEASE-CLAIM configuration used for quality claims, because
 * provisional (AI-drafted / rule-generated) data must not inflate them.
 */
export function createSpellEngineV1(overrides: Partial<SpellEngineConfig> & { minTier?: DataTier } = {}): SpellEngineV1 {
  return new SpellEngineV1({
    packs: packsAtTier(overrides.packs ?? BUNDLED_PACKS, overrides.minTier ?? "PROVISIONAL"),
    typoPairs: overrides.typoPairs ?? BUNDLED_TYPO_PAIRS,
    userDictionary: overrides.userDictionary,
    research: overrides.research,
    environment: overrides.environment,
    researchMinLength: overrides.researchMinLength,
    researchPolicy: overrides.researchPolicy,
    domains: overrides.domains,
  });
}
