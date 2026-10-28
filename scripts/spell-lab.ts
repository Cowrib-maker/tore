/**
 * TORE Spell Lab — LOCAL developer tool.
 *   npx tsx scripts/spell-lab.ts [--port 4318]
 *   → http://127.0.0.1:4318
 *
 * Paste or pick Mongolian text and compare, side by side:
 *   LEGACY    the legacy orthography engine (v0)
 *   FROZEN    the shipping engine as it stood at the start of the language-intelligence phase (regression baseline)
 *   NEW       the current engine (class-A data, domain packs, diagnostics: boundary + capitalization)
 *   RESEARCH  NEW + the local research dictionary (only if .spell-research/dict-mn exists)
 * Binds to loopback only; text is processed in this process and never logged or sent anywhere.
 */
import http from "node:http";
import { buildOrthographySuggestions } from "../src/domain/mongolian-orthography";
import { createSpellEngineV1 } from "../src/spell-engine/bundled";
import { BoundaryModule } from "../src/spell-engine/diagnostics/boundary";
import { CapitalizationModule } from "../src/spell-engine/diagnostics/capitalization";
import { DiagnosticPipeline } from "../src/spell-engine/diagnostics/pipeline";
import { normalizeToken } from "../src/spell-engine/tokenizer/normalize";
import { createSpellEngineV1 as createFrozen } from "../tests/evaluation/spell-v1/frozen-shipping-2026-10-06/engine/bundled";
import { FREQ_FILE } from "./spell-data/frequency";
import { hasResearchDict, loadFrequencyTable, loadHunspellResearchProvider } from "./spell-data/lib/hunspell-provider";
import { LAB_SAMPLES } from "./spell-lab-samples";

const port = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 4318);

type Sug = { text: string; confidence: number; reason?: string };
type Row = { token: string; start: number; end: number; verdict: string; reason: string; kind: string; source: string; status: string; suggestions: Sug[]; morphology: string };

async function main() {
  const frozen = createFrozen();
  const shipping = createSpellEngineV1();
  const pipeline = new DiagnosticPipeline(shipping, [new BoundaryModule(), new CapitalizationModule()]);
  const research = hasResearchDict()
    ? createSpellEngineV1({ research: await loadHunspellResearchProvider(loadFrequencyTable(FREQ_FILE)), environment: "development" })
    : undefined;

  const morph = (e: typeof shipping, token: string): string => {
    const key = normalizeToken(token);
    const m = e.morphology.analyze(key);
    if (m.parses.length > 0) return `lemma ${m.parses[0]!.lemma} [${m.parses[0]!.tags.join("+")}]`;
    if (m.violations.length > 0) return `lemma ${m.violations[0]!.lemma}: ${m.violations[0]!.kind} «${m.violations[0]!.observed}» (expected «${m.violations[0]!.expected}»)`;
    return "—";
  };
  const runV1 = (e: typeof shipping, text: string, withModules = false) => {
    const t0 = performance.now();
    const rows: Row[] = [];
    if (withModules) {
      for (const d of pipeline.diagnose(text, { reportUnknown: true })) {
        rows.push({ token: d.original, start: d.range.start, end: d.range.end, verdict: d.verdict, reason: d.reason, kind: d.type, source: d.source, status: d.suggestionStatus, suggestions: d.suggestions.map((s) => ({ text: s.text, confidence: s.confidence, reason: s.reason })), morphology: d.source === "spell" ? morph(e, d.original) : "—" });
      }
    } else {
      const r = e.analyze(text, { reportUnknown: true });
      for (const i of r.issues) rows.push({ token: i.token, start: i.range.start, end: i.range.end, verdict: i.verdict, reason: i.reasonCode, kind: "SPELLING", source: "spell", status: i.suggestionStatus ?? "NONE", suggestions: i.suggestions.map((s) => ({ text: s.text, confidence: s.confidence, reason: s.reason })), morphology: morph(e, i.token) });
    }
    const st = e.analyze(text).stats;
    return { ms: performance.now() - t0, stats: st, rows, version: e.dataPackVersion };
  };

  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE.replace("__SAMPLES__", JSON.stringify(LAB_SAMPLES)).replace("__RESEARCH__", String(!!research)));
      return;
    }
    if (req.method === "POST" && req.url === "/api/check") {
      let body = "";
      for await (const c of req) {
        body += c;
        if (body.length > 3_000_000) return void res.writeHead(413).end();
      }
      const { text } = JSON.parse(body) as { text: string };
      const t0 = performance.now();
      const lg = buildOrthographySuggestions(text, { includeLatinToCyrillic: false });
      const legacyRows: Row[] = lg.suggestions
        .filter((s) => s.start >= 0 && s.end <= text.length && s.start < s.end)
        .map((s) => ({ token: text.slice(s.start, s.end), start: s.start, end: s.end, verdict: "FLAGGED", reason: s.kind, kind: s.kind, source: "legacy", status: "NONE", suggestions: (s.candidates ?? [s.suggestedWord]).filter(Boolean).map((x: string) => ({ text: x, confidence: 0 })), morphology: "—" }));
      const out = {
        legacy: { ms: performance.now() - t0, rows: legacyRows, stats: { wordCount: 0 }, version: "orthography-rules 0.1.0" },
        frozen: runV1(frozen as unknown as typeof shipping, text),
        shipping: runV1(shipping, text, true),
        research: research ? runV1(research, text) : null,
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`TORE Spell Lab → http://127.0.0.1:${port}   (research engine: ${research ? "ON (dict-mn, local only)" : "off — run scripts/spell-data/pipeline.ts fetch"})`);
  });
}

const PAGE = `<!doctype html><meta charset="utf-8"><title>TORE Spell Lab</title>
<style>
body{font:14px system-ui;margin:0;background:#f6f7f9;color:#1b2430}header{padding:10px 16px;background:#0f2a4a;color:#fff}
main{padding:12px 16px}textarea{width:100%;height:130px;font:15px/1.5 system-ui;box-sizing:border-box}
select,button{font:14px system-ui;padding:4px 8px}.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px}
.col{background:#fff;border:1px solid #d8dde4;border-radius:6px;padding:10px}.col h2{margin:0 0 4px;font-size:15px}.meta{color:#5a6877;font-size:12px;margin-bottom:6px}
.txt{white-space:pre-wrap;line-height:1.6;border:1px solid #eceff3;padding:6px;border-radius:4px;max-height:220px;overflow:auto}
.m{background:#ffd6d6;border-bottom:2px solid #d33}.u{background:#fff3c4;border-bottom:2px dotted #b8860b}.f{background:#ffd6d6;border-bottom:2px solid #d33}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}td,th{border-bottom:1px solid #eee;padding:2px 4px;text-align:left}.note{color:#5a6877;font-size:12px}
</style>
<header><b>TORE Spell Lab</b> — local only · text never leaves this computer</header>
<main>
<label>Жишээ: <select id="s"></select></label> <button id="go">Шалгах</button> <button id="exp">Үр дүн экспортлох (JSON)</button>
<span class="note">  Улаан = алдаа · Шар = тодорхойгүй (алдаа гэж үзэхгүй)</span>
<textarea id="t" spellcheck="false"></textarea>
<div class="cols" id="out"></div>
<p class="note" id="exp"></p></main>
<script>
const SAMPLES=__SAMPLES__, HAS_RESEARCH=__RESEARCH__;
const $=id=>document.getElementById(id);
$("s").innerHTML='<option value="">— өөрийн текст —</option>'+SAMPLES.map(s=>'<option value="'+s.id+'">'+s.title+'</option>').join("");
$("s").onchange=()=>{const s=SAMPLES.find(x=>x.id===$("s").value);if(s){$("t").value=s.text;$("exp").textContent=s.errors.length?"Зориудаар оруулсан алдаа: "+s.errors.join(", "):"Энэ жишээ зөв бичигдсэн — алдаа илэрвэл ХУДАЛ.";go();}};
const esc=s=>s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
function render(name,r,cls){if(!r)return '<div class="col"><h2>'+name+'</h2><div class="meta">идэвхгүй</div></div>';
 const text=$("t").value;let h="",p=0;for(const i of [...r.rows].sort((a,b)=>a.start-b.start)){if(i.start<p)continue;h+=esc(text.slice(p,i.start))+'<span class="'+(i.verdict==="UNKNOWN"?"u":"m")+'">'+esc(text.slice(i.start,i.end))+'</span>';p=i.end}h+=esc(text.slice(p));
 const bad=r.rows.filter(i=>i.verdict!=="UNKNOWN").length,unk=r.rows.length-bad;
 return '<div class="col"><h2>'+name+'</h2><div class="meta">v '+esc(r.version)+' · '+r.ms.toFixed(1)+' мс · алдаа '+bad+(unk?' · тодорхойгүй '+unk:'')+'</div><div class="txt">'+h+'</div><table><tr><th>үг</th><th>дүгнэлт · шалтгаан</th><th>санал (итгэл)</th><th>эх</th><th>морфологи</th></tr>'+r.rows.map(i=>'<tr><td>'+esc(i.token)+'</td><td>'+esc(i.verdict+" · "+i.reason)+'</td><td>'+(i.status==="AMBIGUOUS"?'<i>Тодорхойгүй: </i>':'')+esc(i.suggestions.map(x=>x.text+(x.confidence?" ("+x.confidence+")":"")).join(", "))+'</td><td>'+esc(i.source)+'</td><td>'+esc(i.morphology)+'</td></tr>').join("")+'</table></div>'}
async function go(){const r=await (await fetch("/api/check",{method:"POST",body:JSON.stringify({text:$("t").value})})).json();
 window.__last=r;$("out").innerHTML=render("LEGACY (v0)",r.legacy)+render("CURRENT SHIPPING (frozen 2026-10-06)",r.frozen)+render("NEW ENGINE (shipping data + diagnostics)",r.shipping)+render("RESEARCH (new + local dictionary)",r.research)}
$("exp").onclick=()=>{const b=new Blob([JSON.stringify({input:$("t").value,date:new Date().toISOString(),result:window.__last},null,1)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="spell-lab-result.json";a.click()}
$("go").onclick=go;$("t").oninput=()=>{clearTimeout(window.__t);window.__t=setTimeout(go,300)};
</script>`;

void main();
