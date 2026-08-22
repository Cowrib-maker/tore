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

  const title =
    decodeEntities(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? "")
      .replace(/\s+/g, " ")
      .trim() ||
    decodeEntities(
      firstMatch(
        html,
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      ) ?? "",
    ).trim() ||
    null;

  const canonical = firstMatch(
    html,
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
  );
  const issuedOn = isoDate(dataBlockText(html, "enacteddate"));
  const effectiveOn = isoDate(dataBlockText(html, "enforcementdate"));
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
    /(\d{4})\s*оны\s*(\d{1,2})\s*(?:дуг[аэ]ар|дүгээр)\s*сарын\s*(\d{1,2})/i,
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
