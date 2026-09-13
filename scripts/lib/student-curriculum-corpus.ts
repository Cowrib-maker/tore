/**
 * Adapter from TORE's own first-party student-curriculum content
 * (src/domain/student/*.ts) into plain {id, text} documents for the
 * corpus-vocabulary pipeline.
 *
 * IMPORTANT PROVENANCE NOTE: unlike tests/fixtures/*.html (real primary
 * legal-source text — the Constitution, statutes), this content is
 * TORE's OWN authored pedagogical prose ABOUT Mongolian law (lesson
 * explanations, quiz questions, case-study rubrics). It is real,
 * extensive, and correctly written legal-domain Mongolian — and, being
 * TORE's own first-party IP already checked into this repository, carries
 * zero external licensing/copyright concern — but it is not itself a
 * primary legal source. Every place this corpus is used downstream keeps
 * this distinct from the fixture-derived primary-source documents rather
 * than silently blending the two categories.
 *
 * There is no markup here (no HTML/parser involved) — the data is
 * already structured plain TypeScript objects, so this is a direct field
 * extraction, not a duplicate of any parsing logic.
 */

import { civilLessons, civilProblem, civilTest } from "../../src/domain/student/civil";
import {
  administrativeLessons,
  administrativeProblem,
  administrativeTest,
} from "../../src/domain/student/administrative";
import { criminalLessons, criminalProblem, criminalTest } from "../../src/domain/student/criminal";
import { STUDENT_PROBLEM_RUBRIC } from "../../src/domain/student/legal-problems";
import type { StudentLesson, StudentQuiz } from "../../src/domain/student/types";

export type StudentCorpusDocument = { id: string; text: string };

function lessonToDocuments(trackId: string, lessons: readonly StudentLesson[]): StudentCorpusDocument[] {
  return lessons.map((lesson) => ({
    id: `student:${trackId}:lesson:${lesson.id}`,
    text: [lesson.title, lesson.summary, ...lesson.sections.flatMap((s) => [s.heading, s.body])].join("\n"),
  }));
}

function quizToDocuments(trackId: string, quiz: StudentQuiz): StudentCorpusDocument[] {
  return quiz.questions.map((question) => ({
    id: `student:${trackId}:${quiz.id}:q:${question.id}`,
    text: [
      question.prompt,
      question.factPattern ?? "",
      ...question.options.map((o) => o.label),
      question.explanation,
    ]
      .filter(Boolean)
      .join("\n"),
  }));
}

/** All student-curriculum text, as one flat list of small documents (one
 * per lesson and one per quiz question) — a finer grain than "one file =
 * one document" gives the corpus-vocabulary pipeline meaningfully more
 * independent units to compute document-frequency over. */
export function buildStudentCurriculumCorpus(): StudentCorpusDocument[] {
  return [
    ...lessonToDocuments("criminal", criminalLessons),
    ...quizToDocuments("criminal", criminalTest),
    ...quizToDocuments("criminal", criminalProblem),
    ...lessonToDocuments("civil", civilLessons),
    ...quizToDocuments("civil", civilTest),
    ...quizToDocuments("civil", civilProblem),
    ...lessonToDocuments("administrative", administrativeLessons),
    ...quizToDocuments("administrative", administrativeTest),
    ...quizToDocuments("administrative", administrativeProblem),
    ...STUDENT_PROBLEM_RUBRIC.map((item) => ({
      id: `student:rubric:${item.id}`,
      text: [item.label, item.guidance].join("\n"),
    })),
  ];
}
