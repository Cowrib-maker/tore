/**
 * Gold candidate sets on disk, separated PHYSICALLY by provenance (never silently mixed):
 *   gold/native/    only NATIVE_REVIEWED items (≥2 distinct native reviewers agree)
 *   gold/engineer/  only ENGINEER_REVIEWED items
 *   gold/model/     MODEL_ADJUDICATED (and UNREVIEWED / pending / disputed) items — candidates, NOT gold
 *   gold/auto/      AUTO_GENERATED items
 * `partition()` decides where an item belongs from its decision log alone.
 */
import fs from "node:fs";
import path from "node:path";
import { itemState, type ReviewStatus, type SpellReviewItem } from "../../../src/spell-engine/review/review";

export const GOLD_ROOT = path.join(__dirname, "gold");
export const DIRS = ["native", "engineer", "model", "auto"] as const;
export type Dir = (typeof DIRS)[number];
export type SetFile = { schema: "tore-spell-gold/1"; datasetVersion: string; set: string; provenanceDir: Dir; note: string; items: SpellReviewItem[] };

/** Which directory an item with this status belongs in. */
export function dirFor(status: ReviewStatus): Dir {
  switch (status) {
    case "NATIVE_REVIEWED": return "native";
    case "ENGINEER_REVIEWED": return "engineer";
    case "AUTO_GENERATED": return "auto";
    default: return "model"; // MODEL_ADJUDICATED, NATIVE_PENDING, DISPUTED, UNREVIEWED: still candidates
  }
}

export function loadAll(root = GOLD_ROOT): SetFile[] {
  const out: SetFile[] = [];
  for (const d of DIRS) {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) out.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as SetFile);
  }
  return out;
}

/** Re-file every item into the directory its CURRENT status demands (writes files). Returns how many moved. */
export function promote(root = GOLD_ROOT): { moved: number } {
  const sets = loadAll(root);
  const bucket = new Map<string, SetFile>(); // `${dir}/${set}`
  let moved = 0;
  for (const sf of sets) {
    for (const it of sf.items) {
      const dir = dirFor(itemState(it).status);
      if (dir !== sf.provenanceDir) moved += 1;
      const key = `${dir}/${sf.set}`;
      const target = bucket.get(key) ?? { ...sf, provenanceDir: dir, items: [] };
      target.items.push(it);
      bucket.set(key, target);
    }
  }
  for (const d of DIRS) for (const f of fs.existsSync(path.join(root, d)) ? fs.readdirSync(path.join(root, d)).filter((x) => x.endsWith(".json")) : []) fs.rmSync(path.join(root, d, f));
  for (const [key, sf] of bucket) {
    const file = path.join(root, key + ".json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(sf, null, 1) + "\n");
  }
  return { moved };
}

import { lex } from "../../../src/spell-engine/tokenizer/lexer";
/** Start offset of the first token whose text is exactly `token` (a substring match would hit «үү» inside «сүүлээр»). */
export function locate(sentence: string, token: string): number {
  const t = lex(sentence).find((x) => x.text === token);
  return t ? t.range.start : sentence.indexOf(token);
}
