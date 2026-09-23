import { classifyEntryIntoForceClause } from "@/engine/knowledge/temporal/classify-entry-into-force-clause";

type PageMetadata = {
  lawId: string | null;
  title: string | null;
  officialUrl: string | null;
  documentNumber: string | null;
  publicationSeries: string | null;
  issuedOn: string | null;
  effectiveOn: string | null;
};

export function extractLegalInfoMetadata(
  html: string,
  officialUrl?: string,
): PageMetadata {
  const lawId =
    firstMatch(html, /[?&]lawId=(\d+)/i) ??
    firstMatch(html, /downloadlaw\(\s*['"]1['"]\s*,\s*['"](\d+)['"]/i) ??
    firstMatch(html, /var\s+lawId\s*=\s*['"](\d+)['"]/i);

  // Priority: og:title / <title> before the page's first <h1>.
  //
  // Evidence (2026-09-22, real corpus): checked every locally-archived
  // document where extraction picked the wrong title (lawIds 223, 224 — an
  // "(...орчуулга) Unofficial translation" banner; 344 — the page's first
  // ARTICLE heading, "Article 1.Purpose of the Law") against a sample of
  // documents that parsed correctly (216, 367, 563, 7106). The correct
  // documents have NO <h1> at all on the page — they were only ever correct
  // because the old h1-first lookup found nothing and fell through to
  // og:title. og:title held the real, official title in every one of the 7
  // documents checked, including all 3 known-bad ones. <h1> is unreliable
  // whenever present (translation notices, per-article headings, boilerplate
  // "LAW OF MONGOLIA" stamps) — it is kept only as a last-resort fallback for
  // a page that has neither a usable og:title nor a <title> tag.
  const title =
    decodeEntities(
      firstMatch(
        html,
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      ) ?? "",
    ).trim() ||
    decodeEntities(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? "")
      .replace(/\s+/g, " ")
      .trim() ||
    decodeEntities(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? "")
      .replace(/\s+/g, " ")
      .trim() ||
    null;

  const canonical = firstMatch(
    html,
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
  );
  // Evidence (2026-09-23, real 105-document corpus): `data-block="enacteddate"`
  // / `data-block="enforcementdate"` NEVER appear on a real archived page —
  // 0/105. The real adoption date lives in the "sanal-form" faceted-filter
  // widget printed just above the law body (type / date / place / title, in
  // that order, each pre-checked to match THIS document) — see
  // extractLegalInfoAdoptionDate. Real effective date requires classifying
  // the law's own entry-into-force article (see classifyEntryIntoForceClause
  // in engine/knowledge/temporal) — resolved only for the templates that
  // module has verified real evidence for; every other case stays null,
  // never guessed.
  const issuedOn = extractLegalInfoAdoptionDate(html);
  const effectiveOn = resolveLegalInfoEffectiveDate(html, issuedOn);
  const series = innerText(
    firstMatch(html, /Төрийн мэдээлэл эмхэтгэл:\s*([^<]+)/i),
  );
  const documentNumber =
    dataBlockText(html, "lawnumber") ??
    dataBlockText(html, "lawno") ??
    firstMatch(html, /Хуулийн\s+дугаар\s*[:：]\s*([^<\n]+)/i) ??
    series;

  return {
    lawId,
    title: isGenericHeader(title) ? null : title,
    officialUrl: officialUrl ?? canonical,
    documentNumber,
    publicationSeries: series,
    issuedOn,
    effectiveOn,
  };
}

/**
 * A Mongolian statute page prints its own classification as a small
 * pre-checked filter form just above the law body: instrument type, then
 * adoption date, then place of adoption, then title, in that fixed order
 * — e.g. "МОНГОЛ УЛСЫН ХУУЛЬ" / "2002 ОНЫ 1 ДҮГЭЭР САРЫН 10-НЫ ӨДӨР" /
 * "УЛААНБААТАР ХОТ" / "ИРГЭНИЙ ХУУЛЬ". Verified against 105/105 real
 * archived documents (2026-09-23): every one has this form, and the
 * second checked label is always this document's own adoption date —
 * cross-checked against known facts (e.g. lawId=299's date here,
 * 2002-01-10, matches the Civil Code's well-known adoption date).
 *
 * This is the ADOPTION date ("баталсан огноо") — when the law was
 * approved — never the effective date. The two often differ (see
 * classifyEntryIntoForceClause); conflating them is exactly the mistake
 * this extraction is designed to avoid.
 */
export function extractLegalInfoAdoptionDate(html: string): string | null {
  const formStart = html.indexOf('<form class="sanal-form" action="#">');
  if (formStart < 0) {
    return null;
  }
  const formEnd = html.indexOf("</form>", formStart);
  const formHtml = formEnd > formStart ? html.slice(formStart, formEnd) : html.slice(formStart);
  const checkedLabels = [
    ...formHtml.matchAll(/data-status=["']checked["'][^>]*>\s*<label[^>]*>([^<]*)<\/label>/gi),
  ].map((m) => m[1]!.trim());
  // index 1: [type, DATE, place, title, ...articles]
  return isoDate(checkedLabels[1] ?? null);
}

/**
 * Resolves this law's own effective date from its entry-into-force
 * article, using only the templates classifyEntryIntoForceClause has
 * verified real evidence for. `adoptionDate` (from
 * extractLegalInfoAdoptionDate) is consulted ONLY for the
 * SELF_ADOPTION_DATE template, where the source text itself says effect
 * starts on the day of adoption — never used as a stand-in effective
 * date otherwise. CROSS_DOCUMENT_REFERENCE and UNRECOGNIZED both return
 * null: resolving a reference to another law's own effective date would
 * need a second lookup this function does not attempt, and guessing is
 * worse than an honest unknown.
 */
export function resolveLegalInfoEffectiveDate(
  html: string,
  adoptionDate: string | null,
): string | null {
  const clauseText = findEntryIntoForceClauseText(html);
  if (!clauseText) {
    return null;
  }
  const evidence = classifyEntryIntoForceClause(clauseText);
  if (evidence.kind === "FIXED_DATE") {
    return evidence.date;
  }
  if (evidence.kind === "SELF_ADOPTION_DATE") {
    return adoptionDate;
  }
  return null;
}

/**
 * The entry-into-force clause is almost always the law's last operative
 * article, so this scans from the end of the extracted law body (never
 * the raw page — nav/chrome text must not collide with real article
 * text) for the last line carrying entry-into-force vocabulary. Exported
 * so a caller that needs the full classification (not just the resolved
 * date resolveLegalInfoEffectiveDate returns) — e.g. an audit reporting
 * WHY a date is unknown — can classify the same text this module uses
 * internally, rather than re-deriving it with separate logic.
 */
export function findEntryIntoForceClauseText(html: string): string | null {
  const lines = legalInfoHtmlToLines(html);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/дагаж мөрдөнө|хүчин төгөлдөр болно/iu.test(lines[i]!)) {
      return lines[i]!;
    }
  }
  return null;
}

export function legalInfoHtmlToLines(html: string): string[] {
  const withoutNoise = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // LegalInfo UI chrome glued beside article text (print / listen / share).
    .replace(
      /<(?:span|a|button)\b[^>]*(?:print-zuil|listen|media-link|text-share)[^>]*>[\s\S]*?<\/(?:span|a|button)>/gi,
      "",
    );
  const content = extractLawBody(withoutNoise);
  const withBreaks = content
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(
      /<\/(p|div|h[1-6]|li|tr|section|article|blockquote|td)>/gi,
      "\n",
    );
  const text = decodeEntities(withBreaks.replace(/<[^>]+>/g, " "));
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/^Хэвлэх\s+/i, "")
        .trim(),
    )
    .filter((line) => line.length > 0);
}

/**
 * Prefer the best depth-balanced law-body container.
 *
 * LegalInfo wraps statute text in nested `div.law_content` / `maincontenter`
 * trees. A non-greedy `[\s\S]*?</div>` match stops at the first nested close
 * tag (toolbar only) and yields zero articles — balanced extraction is required.
 *
 * Some laws ship a longer unofficial English translation pane alongside the
 * Mongolian statute. Prefer the pane with Mongolian article markers, not merely
 * the longest HTML fragment.
 */
function extractLawBody(html: string): string {
  const openRe =
    /<(div|section|article)\b([^>]*(?:id|class)=["'][^"']*(?:law[-_ ]?(?:content|body|text)|ck-content|detail[-_]?content|main-huuliin-content|maincontenter)[^"']*["'][^>]*)>/gi;

  let best: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html))) {
    const inner = extractBalancedElementInner(html, match);
    if (inner == null || inner.trim().length === 0) {
      continue;
    }
    const score = scoreLawBodyCandidate(inner);
    if (
      best == null ||
      score > bestScore ||
      (score === bestScore && inner.length > best.length)
    ) {
      best = inner;
      bestScore = score;
    }
  }
  if (best != null) {
    return best;
  }

  const bodyOpen = /<body\b[^>]*>/i.exec(html);
  if (bodyOpen && bodyOpen.index != null) {
    const close = html.toLowerCase().lastIndexOf("</body>");
    if (close > bodyOpen.index) {
      return html.slice(bodyOpen.index + bodyOpen[0].length, close);
    }
  }
  return html;
}

function scoreLawBodyCandidate(inner: string): number {
  const mongolianNumeric = (
    inner.match(/\d+\s*(?:дүгээр|дугаар)\s+зүйл/gi) ?? []
  ).length;
  const mongolianDotted = (
    inner.match(/\d+\.\d+\s*(?:дүгээр|дугаар)\s+зүйл/gi) ?? []
  ).length;
  const mongolianWord = (inner.match(/[А-ЯӨҮЁа-яөүё]+\s+зүйл\s*\./g) ?? [])
    .length;
  const englishArticle = (inner.match(/\bArticle\s+\d+/gi) ?? []).length;
  // Weight Mongolian statute markers far above raw length; penalize English panes.
  // Dotted headings (`17.1 дүгээр зүйл`) are first-class articles.
  return (
    mongolianNumeric * 10 +
    mongolianDotted * 10 +
    mongolianWord * 10 -
    englishArticle * 5
  );
}

function extractBalancedElementInner(
  html: string,
  openMatch: RegExpExecArray,
): string | null {
  const tag = (openMatch[1] ?? "div").toLowerCase();
  const start = openMatch.index + openMatch[0].length;
  let depth = 1;
  let cursor = start;
  const openTag = new RegExp(`<${tag}\\b`, "gi");
  const closeTag = new RegExp(`</${tag}\\s*>`, "gi");

  while (cursor < html.length && depth > 0) {
    openTag.lastIndex = cursor;
    closeTag.lastIndex = cursor;
    const nextOpen = openTag.exec(html);
    const nextClose = closeTag.exec(html);
    if (!nextClose) {
      return null;
    }
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return html.slice(start, nextClose.index);
    }
    cursor = nextClose.index + nextClose[0].length;
  }
  return null;
}

function isGenericHeader(title: string | null): boolean {
  if (!title) {
    return true;
  }
  return /^МОНГОЛ\s+УЛСЫН\s+ХУУЛЬ$/i.test(title) || /^legalinfo/i.test(title);
}

function isoDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const dotted = value.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dotted) {
    return `${dotted[1]}-${pad2(dotted[2])}-${pad2(dotted[3])}`;
  }
  const mn = value.match(
    /(\d{4})\s*оны\s*(\d{1,2})\s*(?:дуг[аэ]ар|дүгээр)?\s*сарын?\s*(\d{1,2})/i,
  );
  if (mn) {
    return `${mn[1]}-${pad2(mn[2])}-${pad2(mn[3])}`;
  }
  return null;
}

function pad2(value: string | undefined): string {
  return (value ?? "01").padStart(2, "0");
}

function dataBlockText(html: string, name: string): string | null {
  return innerText(
    firstMatch(
      html,
      new RegExp(`data-block=["']${name}["'][^>]*>([\\s\\S]*?)</`, "i"),
    ),
  );
}

function innerText(html: string | null): string | null {
  if (!html) {
    return null;
  }
  const text = decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

function firstMatch(source: string, pattern: RegExp): string | null {
  const match = source.match(pattern);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 10)),
    );
}
