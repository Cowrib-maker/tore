/**
 * LOCAL-ONLY research lexicon backed by real Hunspell (WASM) and the dict-mn
 * dictionary in .spell-research/dict-mn (data class C; licence AMBIGUOUS —
 * see docs/spell/DATA-SOURCES.md). Lives under scripts/, never under src/,
 * so no product bundle can import it.
 */
import fs from "node:fs";
import path from "node:path";
import { loadModule } from "hunspell-asm";
import type { ExternalLexiconProvider } from "../../../src/spell-engine/research/provider";
import { RESEARCH_DIR } from "../sources";

const ROOT = path.resolve(__dirname, "../../..");

export type HunspellResearchProvider = ExternalLexiconProvider & {
  suggest(word: string): string[];
  dispose(): void;
};

export function researchDictDir(): string {
  return process.env.TORE_SPELL_RESEARCH_DIR ?? path.join(ROOT, RESEARCH_DIR, "dict-mn");
}

export function hasResearchDict(): boolean {
  const d = researchDictDir();
  return fs.existsSync(path.join(d, "mn_MN.aff")) && fs.existsSync(path.join(d, "mn_MN.dic"));
}

/** Local frequency table built by scripts/spell-data/frequency.ts (class D derived, never bundled). */
export function loadFrequencyTable(file: string): { pm(key: string): number; name(key: string): number; tokens: number } | undefined {
  if (!fs.existsSync(file)) return undefined;
  const map = new Map<string, [number, number]>();
  let tokens = 0;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("#")) {
      const m = /tokens=(\d+)/.exec(line);
      if (m) tokens = Number(m[1]);
      continue;
    }
    const [k, n, l] = line.split("\t");
    if (k) map.set(k, [Number(n), Number(l)]);
  }
  return {
    tokens,
    pm: (key) => ((map.get(key)?.[0] ?? 0) / Math.max(tokens, 1)) * 1e6,
    // names are mostly capitalised: low lower-case share with enough evidence
    name: (key) => {
      const r = map.get(key);
      if (!r || r[0] < 3) return 0;
      return 1 - r[1] / r[0];
    },
  };
}

export async function loadHunspellResearchProvider(
  freq?: ReturnType<typeof loadFrequencyTable>,
): Promise<HunspellResearchProvider> {
  const dir = researchDictDir();
  const factory = await loadModule();
  const aff = factory.mountBuffer(fs.readFileSync(path.join(dir, "mn_MN.aff")), "mn_MN.aff");
  const dic = factory.mountBuffer(fs.readFileSync(path.join(dir, "mn_MN.dic")), "mn_MN.dic");
  const hs = factory.create(aff, dic);
  const cache = new Map<string, boolean>();
  return {
    id: "research:dict-mn",
    dataClass: "C_RESEARCH_ONLY",
    redistributable: false,
    accepts(key: string): boolean {
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const v = hs.spell(key);
      if (cache.size > 500_000) cache.clear();
      cache.set(key, v);
      return v;
    },
    frequencyPerMillion: freq?.pm,
    nameLikelihood: freq?.name,
    suggest: (w) => hs.suggest(w),
    dispose() {
      factory.unmount(aff);
      factory.unmount(dic);
    },
  };
}
