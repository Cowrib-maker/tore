import { classifyDatabaseUrl } from "../../scripts/lib/database-url-safety";

/**
 * Fail-closed guards. This suite INSERTS and DELETES rows, so it refuses to run unless ALL of these hold:
 *  1. STUDENT_PROGRESS_TEST_DATABASE_URL is set and its host is an exact local address;
 *  2. the database name is a dedicated throw-away name (tore_student_progress_test or tore_student_progress_test_<suffix>);
 *  3. the operator explicitly confirmed the database is disposable;
 *  4. (checked again in the test itself) the database contains no users before the test starts.
 * "Local host" alone is never treated as proof that a database is disposable.
 */
const url = process.env.STUDENT_PROGRESS_TEST_DATABASE_URL;
const classification = classifyDatabaseUrl(url);
if (classification.kind !== "local") {
  throw new Error(`STUDENT_PROGRESS_TEST_DATABASE_URL must point at a local database (got: ${classification.kind}).`);
}
const dbName = decodeURIComponent(new URL(url!).pathname.replace(/^\//, ""));
if (!/^tore_student_progress_test(_[a-z0-9]+)?$/.test(dbName)) {
  throw new Error("The database name must be tore_student_progress_test or tore_student_progress_test_<suffix>.");
}
if (process.env.STUDENT_PROGRESS_TEST_DB_DISPOSABLE !== "I_CONFIRM_THIS_DATABASE_IS_DISPOSABLE") {
  throw new Error("Set STUDENT_PROGRESS_TEST_DB_DISPOSABLE=I_CONFIRM_THIS_DATABASE_IS_DISPOSABLE to confirm the database can be written and deleted from.");
}
process.env.DATABASE_URL = url;
process.env.AUTH_SECRET ??= "test-auth-secret-minimum-32-characters";
