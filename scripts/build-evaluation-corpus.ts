/**
 * Builds the combined evaluation corpus for the Mongolian Legal
 * Orthography Engine audit: the largest corpus that is both safe (no
 * production DB, no network, no live browser) and reproducible (built
 * entirely from files checked into this git repository).
 *
 * Combines two DISTINCT provenance categories — kept labeled, never
 * silently blended:
 *  1. "fixture" — real primary legal-source text (Constitution, statute
 *     excerpts) from tests/fixtures/*.html, parsed with the actual
 *     production parser (see scripts/lib/fixture-legal-corpus.ts).
 *  2. "student" — TORE's own first-party legal-education prose
 *     (src/domain/student/*.ts): real, extensive, correctly-written
 *     Mongolian legal-domain text, but pedagogical writing ABOUT the law,
 *     not primary law text itself (see scripts/lib/student-curriculum-corpus.ts).
 *
 * Every document id is prefixed with its category ("fixture:" or
 * "student:") specifically so downstream analysis can always tell them
 * apart or filter to just one.
 *
 * Usage:
 *   npx tsx scripts/build-evaluation-corpus.ts > tmp/evaluation-corpus.json
 */

import { buildFixtureKnowledgeExport } from "./lib/fixture-legal-corpus";
import { buildStudentCurriculumCorpus } from "./lib/student-curriculum-corpus";
import type { CorpusDocumentInput } from "../src/domain/mongolian-orthography/corpus-vocabulary";

export type EvaluationCorpusDocument = CorpusDocumentInput & {
  category: "fixture" | "student";
};

export type EvaluationCorpus = {
  builtAt: string;
  documentCount: number;
  categoryCounts: Record<"fixture" | "student", number>;
  documents: EvaluationCorpusDocument[];
};

export async function buildEvaluationCorpus(): Promise<EvaluationCorpus> {
  const fixtureExport = await buildFixtureKnowledgeExport();
  const fixtureDocuments: EvaluationCorpusDocument[] = fixtureExport.documents.map((doc) => ({
    id: `fixture:${doc.id}`,
    text: doc.articles.map((a) => a.text).join("\n"),
    category: "fixture",
  }));

  const studentDocuments: EvaluationCorpusDocument[] = buildStudentCurriculumCorpus().map((doc) => ({
    id: `student:${doc.id}`,
    text: doc.text,
    category: "student",
  }));

  const documents = [...fixtureDocuments, ...studentDocuments];

  return {
    builtAt: "2026-09-13T00:00:00.000Z", // fixed for reproducible diffs
    documentCount: documents.length,
    categoryCounts: {
      fixture: fixtureDocuments.length,
      student: studentDocuments.length,
    },
    documents,
  };
}

async function main() {
  const corpus = await buildEvaluationCorpus();
  process.stdout.write(JSON.stringify(corpus, null, 2));
}

if (require.main === module) {
  void main();
}
