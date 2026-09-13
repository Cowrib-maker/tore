/**
 * Controlled-activation entry point for the generated legal-vocabulary
 * layer. This is the ONLY place in the codebase that is allowed to call
 * {@link registerGeneratedVocabulary} outside of a test — everything
 * upstream of this file (the flag, the loader, the artifact) is inert on
 * its own.
 *
 * Node-only (imports the fs-backed loader) and server-only by
 * placement: it must be imported only from server-only application code
 * (see check-orthography.ts), never from suggestions.ts, dictionary.ts,
 * the mongolian-orthography barrel (./index.ts), or anything a "use
 * client" component imports — those stay exactly as fs/flag-free as
 * before so the free, client-side live spellchecker
 * (orthography-checker.tsx) keeps bundling cleanly for the browser and
 * can never itself decide to activate generated vocabulary.
 *
 * Deterministic and idempotent: calling this twice (or a hundred times)
 * in the same process does the same work each time and leaves the same
 * end state, because registerGeneratedVocabulary() itself is idempotent
 * (Set/Map semantics — see its own doc comment). No caching layer is
 * added on top of that here, on purpose (the artifact is a handful of
 * entries; re-reading and re-validating it is not expensive enough to be
 * worth a stateful cache — "do not optimize prematurely").
 */

import { join } from "node:path";

import { isGeneratedLegalVocabularyEnabled } from "@/lib/feature-flags";
import {
  registerGeneratedVocabulary,
  type RegisterableVocabularyEntry,
} from "@/domain/mongolian-orthography/dictionary";
import { loadGeneratedVocabularyFile } from "@/domain/mongolian-orthography/generated-vocabulary-loader";

const DEFAULT_ARTIFACT_PATH = join(process.cwd(), "generated", "legal-vocabulary.json");

export const GENERATED_VOCABULARY_ACTIVATION_ERROR_PREFIX =
  "TORE_GENERATED_LEGAL_VOCABULARY_V1 is enabled but the generated-vocabulary artifact is invalid";

export type GeneratedVocabularyActivationResult =
  | { enabled: false }
  | { enabled: true; ok: true; registeredCount: number; artifactPath: string; generatedAt: string; isStale: boolean }
  | { enabled: true; ok: false; error: string; artifactPath: string };

/**
 * Reads the flag; if OFF, does nothing and returns immediately (the
 * dictionary stays exactly hand-curated). If ON, loads and validates the
 * committed artifact and registers every entry (schemaVersion 2
 * guarantees every entry is already category COMMON/MORPHOLOGICAL_STEM
 * and trustLevel TRUSTED — see corpus-vocabulary.ts — but this function
 * re-checks trustLevel itself before registering anyway, as defense in
 * depth against a hand-edited artifact file that somehow still passed a
 * looser validator in the future).
 *
 * Throws if the flag is ON but the artifact fails validation: an operator
 * who explicitly turned this on and got a broken/corrupted artifact
 * needs to see that immediately (at boot, in logs/CI), not have it
 * silently degrade to "activation quietly did nothing" — the same
 * fail-loud philosophy env.ts already uses for invalid environment
 * configuration.
 */
export function initializeGeneratedVocabularyIfEnabled(options?: {
  artifactPath?: string;
}): GeneratedVocabularyActivationResult {
  if (!isGeneratedLegalVocabularyEnabled()) {
    return { enabled: false };
  }

  const artifactPath = options?.artifactPath ?? DEFAULT_ARTIFACT_PATH;
  const loaded = loadGeneratedVocabularyFile(artifactPath);
  if (!loaded.ok) {
    throw new Error(
      `${GENERATED_VOCABULARY_ACTIVATION_ERROR_PREFIX}: ${loaded.error}`,
    );
  }

  const trustedOnly = loaded.artifact.entries.filter((entry) => entry.trustLevel === "TRUSTED");
  if (trustedOnly.length !== loaded.artifact.entries.length) {
    // Cannot happen with a schemaVersion-2 artifact that already passed
    // loadGeneratedVocabularyFile's validation (which itself requires
    // every entry to be trustLevel "TRUSTED") — this is a second,
    // independent check at the registration boundary, not a substitute
    // for the loader's own validation.
    throw new Error(
      `${GENERATED_VOCABULARY_ACTIVATION_ERROR_PREFIX}: artifact passed schema validation but contained a non-TRUSTED entry at registration time — refusing to activate.`,
    );
  }

  const registerable: RegisterableVocabularyEntry[] = trustedOnly.map((entry) => ({
    word: entry.word,
    category: entry.category,
    occurrenceCount: entry.occurrenceCount,
    documentFrequency: entry.documentFrequency,
  }));

  registerGeneratedVocabulary(registerable, { source: `generated-artifact:${artifactPath}` });

  return {
    enabled: true,
    ok: true,
    registeredCount: registerable.length,
    artifactPath,
    generatedAt: loaded.artifact.generatedAt,
    isStale: loaded.isStale,
  };
}
