import type { DataPack } from "./lexicon/pack-schema";
import { SpellEngineV1, type SpellEngineConfig, type TypoPair } from "./core/engine";
import abbreviations from "./data/packs/abbreviations.json";
import general from "./data/packs/general.json";
import generalCorpus from "./data/packs/general-corpus.json";
import legal from "./data/packs/legal.json";
import properNouns from "./data/packs/proper-nouns.json";
import typoPairs from "./data/packs/typo-pairs.json";

/** TORE-owned, redistributable packs shipped with the engine. */
export const BUNDLED_PACKS: readonly DataPack[] = [
  general,
  generalCorpus,
  legal,
  properNouns,
  abbreviations,
] as unknown as DataPack[];

export const BUNDLED_TYPO_PAIRS: readonly TypoPair[] = (typoPairs as { pairs: TypoPair[] }).pairs;

export function createSpellEngineV1(overrides: Partial<SpellEngineConfig> = {}): SpellEngineV1 {
  return new SpellEngineV1({
    packs: overrides.packs ?? BUNDLED_PACKS,
    typoPairs: overrides.typoPairs ?? BUNDLED_TYPO_PAIRS,
    userDictionary: overrides.userDictionary,
  });
}
