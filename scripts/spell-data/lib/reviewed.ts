import { itemState, type SpellReviewItem } from "../../../src/spell-engine/review/review";

export type ReviewedLemma = { w: string; pos: string; flags?: string[]; domain: string };

/**
 * Parse vocab-reviewed/lemmas.tsv and REFUSE any line that is not backed by a NATIVE_REVIEWED, VALID lemma item
 * (id `LEMMA:<domain>:<pos>:<word>`). A hand-edited TSV cannot smuggle a lemma into the REVIEWED tier.
 */
export function readReviewedLemmas(tsv: string, nativeItems: readonly SpellReviewItem[]): ReviewedLemma[] {
  const byId = new Map(nativeItems.map((i) => [i.id, i] as const));
  const out: ReviewedLemma[] = [];
  for (const line of tsv.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [w, pos, flags, domain] = line.split("\t");
    if (!w || !pos || !domain) throw new Error(`reviewed lemma line malformed: ${line}`);
    const item = byId.get(`LEMMA:${domain}:${pos}:${w}`);
    const st = item ? itemState(item) : undefined;
    if (!item || st?.status !== "NATIVE_REVIEWED" || st.verdict !== "VALID") throw new Error(`reviewed lemma «${w}» (${pos}, ${domain}) is not backed by a NATIVE_REVIEWED item: refusing to emit tier REVIEWED`);
    out.push({ w, pos, flags: flags ? flags.split(",").filter(Boolean) : undefined, domain });
  }
  return out;
}
