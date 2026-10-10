/**
 * Engine and data versions are stamped into every result so a report or a bug
 * can always be tied to the exact code AND data that produced it. Bump
 * ENGINE_VERSION on any behavioural change; data packs carry their own version.
 */
export const SPELL_ENGINE_ID = "tore-spell-language-engine";
export const SPELL_ENGINE_VERSION = "1.0.0-alpha.1";
/**
 * Language data is versioned independently of the engine so a language update
 * never requires a new application build:
 *   engine (code) · language pack (lexicon + typo pairs) · rules (suffix/morphology tables).
 */
export const SPELL_RULES_VERSION = "2026.10.1";
/** Suffix/stem tables and the analyzer's behavioural contract (morphology/). */
export const SPELL_MORPHOLOGY_VERSION = "2026.10.2";
/** Context model contract; the bundled shipping model is empty by design (see docs/spell/ARCHITECTURE.md). */
export const SPELL_CONTEXT_MODEL_VERSION = "2026.10.1-none";
/** Every version a result depends on (a document result is reproducible from these + the input text). */
export function allSpellVersions(extra: { languagePack: string; lexicon: string; errorModel: string }) {
  return {
    engine: SPELL_ENGINE_VERSION,
    languagePack: extra.languagePack,
    lexicon: extra.lexicon,
    morphology: SPELL_MORPHOLOGY_VERSION,
    rules: SPELL_RULES_VERSION,
    errorModel: extra.errorModel,
    contextModel: SPELL_CONTEXT_MODEL_VERSION,
  };
}
