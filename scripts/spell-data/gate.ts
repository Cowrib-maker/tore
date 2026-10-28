/**
 * Clean-text regression gate.  npx tsx scripts/spell-data/gate.ts [--docs 1500]
 * 1. Always: the committed clean text + protected tokens must produce ZERO MISSPELLED.
 * 2. With the local corpus: flag rate and false-accusation candidates vs the thresholds AND vs the frozen baseline.
 * Exit 1 on failure.
 */
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { createSpellEngineV1 as createFrozen } from "../../tests/evaluation/spell-v1/frozen-shipping-2026-10-06/engine/bundled";
import { eduge, hasEduge } from "./lib/corpus";
import { evaluateGate, THRESHOLDS, type GateMetrics } from "./lib/gate-core";
import { hasResearchDict, loadHunspellResearchProvider } from "./lib/hunspell-provider";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);
type Engine = { analyze(t: string): { tokens: readonly { verdict: string }[] } };

async function main() {
  let fail = false;
  const engine = createSpellEngineV1();
  const clean = fs.readFileSync(path.resolve(__dirname, "../../tests/evaluation/spell-v1/clean-text.txt"), "utf8");
  const committed = engine.analyze(clean).stats;
  console.log(`committed clean text: ${committed.wordCount} words, MISSPELLED ${committed.misspelledCount}`);
  if (committed.misspelledCount !== 0) fail = true;
  if (!hasEduge()) {
    console.log("(no local corpus: corpus gate skipped)");
    process.exit(fail ? 1 : 0);
  }
  const oracle = hasResearchDict() ? await loadHunspellResearchProvider() : undefined;
  const types = new Map<string, { n: number; title: boolean; sample: string }>();
  let words = 0;
  for await (const d of eduge(Number(arg("--docs", "1500")))) {
    for (const t of lex(d.text)) {
      if (t.kind !== "WORD") continue;
      words += 1;
      const k = normalizeToken(t.text);
      const title = t.caseShape === "TITLE" || t.caseShape === "UPPER";
      const r = types.get(k);
      if (r) (r.n += 1, (r.title = r.title && title));
      else types.set(k, { n: 1, title, sample: t.text });
    }
  }
  const measure = (eng: Engine): GateMetrics => {
    let valid = 0;
    let flagged = 0;
    let acc = 0;
    for (const [k, t] of types) {
      const v = eng.analyze(`и ${t.title ? t.sample : k}`).tokens[1]!.verdict;
      if (v === "VALID") valid += t.n;
      else if (v === "MISSPELLED") {
        flagged += t.n;
        if (oracle?.accepts(k)) acc += t.n;
      }
    }
    return { words, flagged, flaggedAccepted: oracle ? acc : null, validShare: valid / words };
  };
  const base = measure(createFrozen() as unknown as Engine);
  const now = measure(engine);
  const res = evaluateGate(now, base);
  console.log(`baseline (frozen): flag ${((base.flagged / words) * 100).toFixed(4)} %  valid ${(base.validShare * 100).toFixed(2)} %`);
  console.log(`current          : flag ${((now.flagged / words) * 100).toFixed(4)} %  valid ${(now.validShare * 100).toFixed(2)} %  FP-candidates ${now.flaggedAccepted ?? "n/a"}`);
  console.log(`thresholds: ceiling ${THRESHOLDS.maxFlagRate * 100} %, target ${THRESHOLDS.targetFlagRate * 100} %, long-term ${THRESHOLDS.longTermFlagRate * 100} %`);
  console.log(`GATE: ${res.level}${res.messages.length ? " — " + res.messages.join("; ") : ""}`);
  oracle?.dispose();
  process.exit(fail || !res.pass ? 1 : 0);
}
void main();
