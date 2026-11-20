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
