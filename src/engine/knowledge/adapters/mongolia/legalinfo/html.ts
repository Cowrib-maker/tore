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
    .replace(/<!--[\s\S]*?-->/g, "");
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
    .map((line) => line.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function extractLawBody(html: string): string {
  const named = html.match(
    /<(?:div|section|article)[^>]*(?:id|class)=["'][^"']*(?:law[-_ ]?(?:content|body|text)|ck-content|detail[-_]?content)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>/i,
  );
  if (named?.[1]) {
    return named[1];
  }
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return body?.[1] ?? html;
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
