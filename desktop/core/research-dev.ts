import fs from "node:fs";
import path from "node:path";
import type { ExternalLexiconProvider } from "../../src/spell-engine/research/provider";

/**
 * DEVELOPMENT BUILDS ONLY. Loads a local Hunspell dictionary (class C research
 * data, licence unresolved — docs/spell/DATA-SOURCES.md) through the WASM
 * Hunspell port, so a developer can use the product on their own machine with
 * a broad lexicon. `hunspell-asm` is a root devDependency, marked external in
 * the development bundle and absent from release bundles.
 */
export async function loadDevResearch(dir: string, frequencyFile?: string): Promise<ExternalLexiconProvider> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadModule } = require("hunspell-asm") as typeof import("hunspell-asm");
  const factory = await loadModule();
  const aff = factory.mountBuffer(fs.readFileSync(path.join(dir, "mn_MN.aff")), "mn_MN.aff");
  const dic = factory.mountBuffer(fs.readFileSync(path.join(dir, "mn_MN.dic")), "mn_MN.dic");
  const hs = factory.create(aff, dic);
  const freq = new Map<string, [number, number]>();
  let tokens = 0;
  if (frequencyFile && fs.existsSync(frequencyFile)) {
    for (const line of fs.readFileSync(frequencyFile, "utf8").split("\n")) {
      if (line.startsWith("#")) tokens = Number(/tokens=(\d+)/.exec(line)?.[1] ?? 0);
      else {
        const [k, n, l] = line.split("\t");
        if (k) freq.set(k, [Number(n), Number(l)]);
      }
    }
  }
  const cache = new Map<string, boolean>();
  return {
    id: "research:dict-mn",
    dataClass: "C_RESEARCH_ONLY",
    redistributable: false,
    accepts(key) {
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const v = hs.spell(key);
      if (cache.size > 200_000) cache.clear();
      cache.set(key, v);
      return v;
    },
    frequencyPerMillion: tokens ? (k) => ((freq.get(k)?.[0] ?? 0) / tokens) * 1e6 : undefined,
    nameLikelihood: tokens
      ? (k) => {
          const r = freq.get(k);
          return !r || r[0] < 3 ? 0 : 1 - r[1] / r[0];
        }
      : undefined,
  };
}
