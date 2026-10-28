/**
 * Which morphology rules overgenerate? For every DEV-slice word the engine accepts through morphology, group by suffix-chain signature and
 * report how often the independent dictionary (research QA only) ALSO accepts it. A low rate on a high-volume signature is a lead for a native
 * question or a rule review — not proof of an error (the dictionary is small and misses names, loans and newer words), and never a reason to
 * change a rule by itself.
 *   npx tsx scripts/spell-data/morph-rule-precision.ts [--min-types 25] [--layer GENERAL] [--sig GEN --suffix-re "(ний|ны)$" --show 40]
 * With --sig, lists the engine-only forms of that signature (optionally filtered by a regex on the form), most frequent first.
 * Only common-word lemmas (default layer GENERAL, no `loan` flag) are counted, so names and loans do not dilute the signal.
 */
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { eduge } from "./lib/corpus";
import { FREQ_FILE } from "./frequency";
import { loadFrequencyTable, loadHunspellResearchProvider } from "./lib/hunspell-provider";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);

async function main() {
  const minTypes = Number(arg("--min-types", "25"));
  const layer = arg("--layer", "GENERAL");
  const hs = await loadHunspellResearchProvider(loadFrequencyTable(FREQ_FILE));
  const eng = createSpellEngineV1();
  const morph = (eng as unknown as { morphology: { analyze(k: string): { parses: { lemma: string; entry: { layer: string; flags: Set<string> | string[] }; tags: string[] }[] } } }).morphology;
  const counts = new Map<string, number>();
  for await (const d of eduge(40_000, 0)) {
    if (d.id % 4 !== 1) continue;
    for (const t of lex(d.text)) if (t.kind === "WORD") counts.set(normalizeToken(t.text), (counts.get(normalizeToken(t.text)) ?? 0) + 1);
  }
  type Row = { types: number; tokens: number; oracleOk: number; examples: string[] };
  const rows = new Map<string, Row>();
  const sigWanted = arg("--sig", "");
  const sigRe = arg("--suffix-re", "") ? new RegExp(arg("--suffix-re", ""), "u") : null;
  const engineOnly: { key: string; n: number; lemma: string; ok: boolean }[] = [];
  for (const [key, n] of counts) {
    if (key.length < 4 || eng.lexicon.has(key)) continue;
    const p = morph.analyze(key).parses[0];
    if (!p || p.entry.layer !== layer) continue;
    const flags = p.entry.flags instanceof Set ? [...p.entry.flags] : p.entry.flags ?? [];
    if (flags.includes("loan")) continue;
    const sig = p.tags.join("+");
    const r = rows.get(sig) ?? { types: 0, tokens: 0, oracleOk: 0, examples: [] };
    r.types += 1;
    r.tokens += n;
    const ok = hs.accepts(key);
    if (sigWanted && sig === sigWanted && (!sigRe || sigRe.test(key))) engineOnly.push({ key, n, lemma: p.lemma, ok });
    if (ok) r.oracleOk += 1;
    else if (r.examples.length < 6) r.examples.push(`${key}×${n}`);
    rows.set(sig, r);
  }
  if (sigWanted) {
    const rej = engineOnly.filter((x) => !x.ok).sort((a, b) => b.n - a.n);
    console.log(`signature ${sigWanted}${sigRe ? ` /${sigRe.source}/` : ""}: ${engineOnly.length} types, second opinion rejects ${rej.length} (${rej.reduce((s2, x) => s2 + x.n, 0)} tokens of ${engineOnly.reduce((s2, x) => s2 + x.n, 0)})`);
    console.log(rej.slice(0, Number(arg("--show", "40"))).map((x) => `${x.key}(${x.lemma})×${x.n}`).join(" "));
    hs.dispose();
    return;
  }
  const list = [...rows].filter(([, r]) => r.types >= minTypes).sort((a, b) => a[1].oracleOk / a[1].types - b[1].oracleOk / b[1].types);
  console.log(`layer ${layer}, signatures with ≥${minTypes} types, ascending by second-opinion agreement:`);
  console.log("signature".padEnd(26), "types".padStart(6), "tokens".padStart(8), "agree".padStart(7), "  accepted-by-engine-only (examples)");
  for (const [sig, r] of list.slice(0, 25)) console.log(sig.padEnd(26), String(r.types).padStart(6), String(r.tokens).padStart(8), `${((100 * r.oracleOk) / r.types).toFixed(0)}%`.padStart(7), " ", r.examples.join(" "));
  const tot = [...rows.values()].reduce((s, r) => ({ t: s.t + r.types, o: s.o + r.oracleOk }), { t: 0, o: 0 });
  console.log(`\nall signatures: ${tot.t} types, second opinion agrees on ${((100 * tot.o) / tot.t).toFixed(1)}%`);
  hs.dispose();
}
void main();
