/** Streaming readers for LOCAL research corpora (never loaded into the product). */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { RESEARCH_DIR } from "../sources";

const ROOT = path.resolve(__dirname, "../../..");

export function edugePath(): string {
  return process.env.TORE_SPELL_EDUGE ?? path.join(ROOT, RESEARCH_DIR, "tugstugi/eduge.csv.gz");
}
export const hasEduge = () => fs.existsSync(edugePath());

/** Yields the article text of each Eduge row (label dropped). */
/** `skip`: documents to pass over first. Docs 1…SEEN_DOCS were used to PRIORITISE vocabulary work (unknown-taxonomy --limit 6000), so
 *  honest coverage numbers come from `skip ≥ HELD_OUT_FROM`. */
export const HELD_OUT_FROM = 40_000;
export async function* eduge(limit = Infinity, skip = 0): AsyncGenerator<{ id: number; label: string; text: string }> {
  const rl = readline.createInterface({
    input: fs.createReadStream(edugePath()).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
  let n = -1;
  for await (const line of rl) {
    n += 1;
    if (n === 0) continue; // header
    if (n <= skip) continue;
    if (n > skip + limit) break;
    const m = /^"([\s\S]*)",\s*([^",]*)$/u.exec(line);
    if (!m) continue;
    yield { id: n, label: m[2]!.trim(), text: m[1]!.replace(/""/g, '"') };
  }
}
