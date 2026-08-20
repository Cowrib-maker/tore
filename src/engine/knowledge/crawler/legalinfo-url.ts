/**
 * Official LegalInfo.mn detail URLs for knowledge crawling.
 */

export const LEGALINFO_HOST = "legalinfo.mn";
export const LEGALINFO_DEFAULT_LOCALE = "mn";

/** 1992 Constitution of Mongolia (Үндсэн хууль) — first production seed. */
export const LEGALINFO_CONSTITUTION_LAW_ID = "367";

/**
 * Known-good live verification set (exactly 5 laws).
 * Includes {@link LEGALINFO_CONSTITUTION_LAW_ID} as the control document.
 */
export const LEGALINFO_VERIFY_LAW_IDS = [
  LEGALINFO_CONSTITUTION_LAW_ID, // Үндсэн хууль
  "439", // Орон сууцны тухай
  "112", // Барилгын тухай
  "123", // Өмч хувьчлах тухай
  "400", // Нотариатын тухай
] as const;

/**
 * Expanded live verification set (exactly 50 laws).
 * Starts with {@link LEGALINFO_VERIFY_LAW_IDS} (includes constitution control).
 */
export const LEGALINFO_VERIFY_50_LAW_IDS = [
  ...LEGALINFO_VERIFY_LAW_IDS,
  "299", // Иргэний хууль
  "59", // Эрүүгийн байцаан шийтгэх хууль
  "209", // Гаалийн тухай
  "302", // Иргэний хэрэг шүүхэд хянан шийдвэрлэх тухай
  "89", // Шүүхийн шийдвэр гүйцэтгэх тухай
  "565", // Хөдөлмөрийн тухай
  "310", // Компанийн тухай
  "284", // Захиргааны хэрэг хянан шийдвэрлэх тухай
  "492", // Төрийн болон орон нутгийн өмчийн тухай
  "232", // Даатгалын тухай
  "473", // Татварын ерөнхий хууль
  "108", // Банкны тухай
  "63", // Ашигт малтмалын тухай
  "493", // Төрийн болон орон нутгийн өмчийн хөрөнгөөр бараа, ажил, үйлчилгээ худалдан авах
  "90", // Шүүхийн тухай
  "337", // Ерөнхийлөгчийн сонгуулийн хууль
  "515", // Улсын тэмдэгтийн хураамжийн тухай
  "118", // Үл хөдлөх эд хөрөнгийн барьцааны тухай
  "226", // Гэр бүлийн тухай
  "502", // Төсвийн байгууллагын удирдлага, санхүүжилтийн тухай
  "351", // УИХ-ын сонгуулийн тухай
  "356", // УИХ-ын чуулганы хуралдааны дэгийн тухай
  "479", // Тусгай хамгаалалттай газар нутгийн тухай
  "216", // Газрын тухай
  "280", // Захиргааны хариуцлагын тухай
  "218", // Газрын хэвлийн тухай
  "97", // Цөмийн энергийн тухай
  "390", // Нийгмийн даатгалын тухай
  "532", // Хот, тосгоны эрх зүйн байдлын тухай
  "230", // Даатгалын мэргэжлийн оролцогчийн тухай
  "372", // Монгол, Хятадын хилийн дэглэмийн тухай
  "208", // Гаалийн тариф, гаалийн татварын тухай
  "87", // Эд хөрөнгө өмчлөх эрх… улсын бүртгэлийн тухай
  "423", // Ойн тухай
  "362", // Цагдаагийн байгууллагын тухай
  "51", // Арбитрын тухай
  "49", // Эрүүл мэндийн тухай
  "576", // Цэргийн алба хаагчийн тэтгэвэр, тэтгэмжийн тухай
  "437", // Орон нутгийн хурлын сонгуулийн тухай
  "483", // Төв банк (Монголбанк)-ны тухай
  "88", // Шүүхийн шинжилгээний тухай
  "528", // Хоршооны тухай
  "344", // Засгийн газрын тухай
  "441", // Прокурорын байгууллагын тухай
  "571", // Хөрөнгөөр баталгаажсан үнэт цаасны тухай
] as const;

export function isLegalInfoHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === LEGALINFO_HOST || host.endsWith(`.${LEGALINFO_HOST}`);
}

/**
 * Canonical official detail page for a LegalInfo law id.
 * Example: lawId `367` → `https://legalinfo.mn/mn/detail?lawId=367`
 */
export function legalInfoDetailUrl(
  lawId: string,
  locale: string = LEGALINFO_DEFAULT_LOCALE,
): string {
  const id = lawId.trim();
  if (!id) {
    throw new Error("LegalInfo lawId is required");
  }
  return `https://${LEGALINFO_HOST}/${locale}/detail?lawId=${encodeURIComponent(id)}`;
}

/** Extract lawId from an official LegalInfo detail URL when present. */
export function lawIdFromLegalInfoUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!isLegalInfoHostname(parsed.hostname)) {
      return null;
    }
    const lawId = parsed.searchParams.get("lawId")?.trim();
    return lawId || null;
  } catch {
    return null;
  }
}

/**
 * Official category index page (SPA shell).
 * Example: category `27` → `https://legalinfo.mn/mn/law/27` (Монгол Улсын хууль).
 */
export function legalInfoCategoryUrl(
  categoryId: string,
  locale: string = LEGALINFO_DEFAULT_LOCALE,
): string {
  const id = categoryId.trim();
  if (!id) {
    throw new Error("LegalInfo categoryId is required");
  }
  return `https://${LEGALINFO_HOST}/${locale}/law/${encodeURIComponent(id)}`;
}

/**
 * Official AJAX list endpoint used by LegalInfo category pages.
 * Example: `https://legalinfo.mn/mn/ajaxList/`
 */
export function legalInfoAjaxListUrl(
  locale: string = LEGALINFO_DEFAULT_LOCALE,
): string {
  return `https://${LEGALINFO_HOST}/${locale}/ajaxList/`;
}

/** Primary legislation category (Монгол Улсын хууль) on LegalInfo. */
export const LEGALINFO_STATUTE_CATEGORY_ID = "27";

/** Constitution category on LegalInfo. */
export const LEGALINFO_CONSTITUTION_CATEGORY_ID = "26";


export function assertHttpsLegalInfoUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new KnowledgeCrawlError("invalid_url", `Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new KnowledgeCrawlError(
      "https_only",
      `Only HTTPS is allowed: ${url}`,
    );
  }
  if (!isLegalInfoHostname(parsed.hostname)) {
    throw new KnowledgeCrawlError(
      "domain",
      `Only ${LEGALINFO_HOST} is allowed: ${url}`,
    );
  }
  return parsed;
}

export type KnowledgeCrawlErrorCode =
  | "invalid_url"
  | "https_only"
  | "domain"
  | "timeout"
  | "http_status"
  | "content_type"
  | "too_large"
  | "network"
  | "redirect";

export class KnowledgeCrawlError extends Error {
  readonly code: KnowledgeCrawlErrorCode;

  constructor(code: KnowledgeCrawlErrorCode, message: string) {
    super(message);
    this.name = "KnowledgeCrawlError";
    this.code = code;
  }
}
