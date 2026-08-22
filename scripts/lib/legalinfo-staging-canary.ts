/**
 * Staging-only LegalInfo canary helpers.
 *
 * No Prisma, S3, or LegalInfo I/O. Safe to unit-test without network.
 * Does not read `.env` and does not mutate the discovery manifest.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const STAGING_NEON_HOST =
  "ep-frosty-frost-ax6pc5mf-pooler.c-4.us-east-2.aws.neon.tech";
export const FORBIDDEN_DATABASE_HOST_TOKEN = "ep-morning-recipe";
export const STAGING_ARCHIVE_S3_PREFIX = "legal-archive-staging";
export const FORBIDDEN_ARCHIVE_S3_PREFIX = "legal-archive";

/**
 * Observed structural article-check targets — not a current-law selection
 * and not a CLI allowlist. 11634 is not the current Criminal Code.
 */
export const STAGING_CANARY_LAW_IDS = ["367", "11634"] as const;

export type StagingCanaryLawId = (typeof STAGING_CANARY_LAW_IDS)[number];

/** Explicit operator-supplied LegalInfo lawId (digits, no leading zeros). */
const STAGING_LAW_ID_PATTERN = /^[1-9]\d*$/;

export type StagingCanaryEnv = {
  DATABASE_URL: string;
  ARCHIVE_STORAGE: "s3";
  ARCHIVE_S3_PREFIX: typeof STAGING_ARCHIVE_S3_PREFIX;
  ARCHIVE_S3_BUCKET?: string;
  S3_BUCKET: string;
  S3_REGION: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_ENDPOINT: string;
  S3_FORCE_PATH_STYLE: boolean;
};

export class StagingCanaryGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StagingCanaryGuardError";
  }
}

export function parseDotenvContents(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

/**
 * Load `.env.staging` only. Refuses to fall back to `.env`.
 */
export function loadStagingEnvFile(rootDir: string): Record<string, string> {
  const stagingPath = join(rootDir, ".env.staging");
  if (!existsSync(stagingPath)) {
    throw new StagingCanaryGuardError(
      "Missing .env.staging — refusing to load .env (would risk the unknown application database).",
    );
  }
  return parseDotenvContents(readFileSync(stagingPath, "utf8"));
}

export function databaseHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    throw new StagingCanaryGuardError("DATABASE_URL is not a valid URL.");
  }
}

export function assertStagingCanaryEnv(
  values: Record<string, string | undefined>,
): StagingCanaryEnv {
  const databaseUrl = values.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) {
    throw new StagingCanaryGuardError("DATABASE_URL is missing in .env.staging.");
  }
  if (databaseUrl.includes(FORBIDDEN_DATABASE_HOST_TOKEN)) {
    throw new StagingCanaryGuardError(
      `DATABASE_URL must not contain ${FORBIDDEN_DATABASE_HOST_TOKEN} (existing/unknown application database).`,
    );
  }
  const host = databaseHost(databaseUrl);
  if (host !== STAGING_NEON_HOST) {
    throw new StagingCanaryGuardError(
      `DATABASE_URL host must be exactly ${STAGING_NEON_HOST} (got ${host}).`,
    );
  }

  const prefix = values.ARCHIVE_S3_PREFIX?.trim() ?? "";
  if (prefix === FORBIDDEN_ARCHIVE_S3_PREFIX || prefix === "") {
    throw new StagingCanaryGuardError(
      `ARCHIVE_S3_PREFIX must be exactly ${STAGING_ARCHIVE_S3_PREFIX}, not "${FORBIDDEN_ARCHIVE_S3_PREFIX}" or empty.`,
    );
  }
  if (prefix !== STAGING_ARCHIVE_S3_PREFIX) {
    throw new StagingCanaryGuardError(
      `ARCHIVE_S3_PREFIX must be exactly ${STAGING_ARCHIVE_S3_PREFIX} (got ${prefix}).`,
    );
  }

  const archiveStorage = values.ARCHIVE_STORAGE?.trim() ?? "";
  if (archiveStorage !== "s3") {
    throw new StagingCanaryGuardError(
      `ARCHIVE_STORAGE must be "s3" (got "${archiveStorage || "(unset)"}").`,
    );
  }

  const bucket = (values.ARCHIVE_S3_BUCKET || values.S3_BUCKET || "").trim();
  const region = values.S3_REGION?.trim() ?? "";
  const accessKeyId = values.S3_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = values.S3_SECRET_ACCESS_KEY?.trim() ?? "";
  const endpoint = values.S3_ENDPOINT?.trim() ?? "";
  if (!bucket || !region || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new StagingCanaryGuardError(
      "Staging S3/R2 credentials are incomplete (need S3_BUCKET or ARCHIVE_S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT).",
    );
  }

  return {
    DATABASE_URL: databaseUrl,
    ARCHIVE_STORAGE: "s3",
    ARCHIVE_S3_PREFIX: STAGING_ARCHIVE_S3_PREFIX,
    ARCHIVE_S3_BUCKET: values.ARCHIVE_S3_BUCKET?.trim() || undefined,
    S3_BUCKET: bucket,
    S3_REGION: region,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
    S3_ENDPOINT: endpoint,
    S3_FORCE_PATH_STYLE: values.S3_FORCE_PATH_STYLE?.trim() === "true",
  };
}

/**
 * Parse operator-supplied `--law-ids`. Only those IDs are fetched.
 * Does not read a discovery manifest or inject catalog IDs.
 */
export function parseStagingLawIds(argv: readonly string[]): string[] {
  const raw = readLawIdsArg(argv);
  if (raw == null) {
    throw new StagingCanaryGuardError(
      "Missing --law-ids. Supply an explicit comma-separated list, for example --law-ids=367,11634",
    );
  }
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    throw new StagingCanaryGuardError(
      "Empty --law-ids. Supply an explicit comma-separated list of numeric law IDs.",
    );
  }
  const unique = new Set(tokens);
  if (unique.size !== tokens.length) {
    throw new StagingCanaryGuardError("Duplicate law IDs are not allowed.");
  }
  for (const id of tokens) {
    if (!STAGING_LAW_ID_PATTERN.test(id)) {
      throw new StagingCanaryGuardError(
        `Law ID ${id} is not a numeric LegalInfo lawId. Only explicit numeric IDs supplied on --law-ids are accepted.`,
      );
    }
  }
  return tokens;
}

function readLawIdsArg(argv: readonly string[]): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg.startsWith("--law-ids=")) {
      return arg.slice("--law-ids=".length);
    }
    if (arg === "--law-ids") {
      return argv[index + 1] ?? "";
    }
  }
  return null;
}

export function isStagingCanaryLawId(value: string): value is StagingCanaryLawId {
  return (STAGING_CANARY_LAW_IDS as readonly string[]).includes(value);
}

export type CanaryArticleCheck = {
  ok: boolean;
  reason: string | null;
  hasArticle1: boolean;
  hasArticle12: boolean;
  hasArticle171: boolean;
  hasArticle172: boolean;
  hasIntegerArticle17: boolean;
};

export function evaluateStagingCanaryArticles(
  lawId: string,
  articles: readonly { articleNumber: string | null }[],
): CanaryArticleCheck {
  const numbers = articles
    .map((article) => article.articleNumber)
    .filter((value): value is string => value != null && value.length > 0);
  const hasArticle1 = numbers.includes("1");
  const hasArticle12 = numbers.includes("12");
  const hasArticle171 = numbers.includes("17.1");
  const hasArticle172 = numbers.includes("17.2");
  const hasIntegerArticle17 = numbers.includes("17");

  if (articles.length === 0) {
    return {
      ok: false,
      reason: "parser/source-structure failure: article count is 0",
      hasArticle1,
      hasArticle12,
      hasArticle171,
      hasArticle172,
      hasIntegerArticle17,
    };
  }

  if (lawId === "367") {
    if (!hasArticle1 || !hasArticle12) {
      return {
        ok: false,
        reason: "Constitution 367 must preserve article 1 and article 12",
        hasArticle1,
        hasArticle12,
        hasArticle171,
        hasArticle172,
        hasIntegerArticle17,
      };
    }
    return {
      ok: true,
      reason: null,
      hasArticle1,
      hasArticle12,
      hasArticle171,
      hasArticle172,
      hasIntegerArticle17,
    };
  }

  if (lawId === "11634") {
    if (!hasArticle171 || !hasArticle172) {
      return {
        ok: false,
        reason: '11634 must contain articleNumber "17.1" and "17.2"',
        hasArticle1,
        hasArticle12,
        hasArticle171,
        hasArticle172,
        hasIntegerArticle17,
      };
    }
    if (hasIntegerArticle17) {
      return {
        ok: false,
        reason:
          '11634 must not invent integer article "17" from dotted headings 17.1 / 17.2',
        hasArticle1,
        hasArticle12,
        hasArticle171,
        hasArticle172,
        hasIntegerArticle17,
      };
    }
    return {
      ok: true,
      reason: null,
      hasArticle1,
      hasArticle12,
      hasArticle171,
      hasArticle172,
      hasIntegerArticle17,
    };
  }

  // Operator-selected law: article count already > 0. Do not infer
  // current/in-force status from title or enforcementdate.
  return {
    ok: true,
    reason: null,
    hasArticle1,
    hasArticle12,
    hasArticle171,
    hasArticle172,
    hasIntegerArticle17,
  };
}

export function parseHttpStatusFromError(message: string): number | null {
  const match = message.match(/\bHTTP\s+(\d{3})\b/i);
  if (!match?.[1]) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}
