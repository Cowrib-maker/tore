/**
 * Pure constants shared by the use-case (server) and the client-safe
 * action-error-message module — kept out of submit-written-attempt.ts so
 * that importing them never drags its Prisma-backed repository import
 * into a client bundle.
 */
export const WRITTEN_EXAM_ANSWER_MIN_CHARS = 60;
export const WRITTEN_EXAM_ANSWER_MAX_CHARS = 6_000;
