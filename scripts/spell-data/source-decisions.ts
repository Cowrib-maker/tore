/** Writes docs/spell/LEXICON-SOURCE-DECISIONS.md from the source registry (a unit test checks the file is current). */
import fs from "node:fs";
import path from "node:path";
import { renderSourceDecisions } from "./sources";

const out = path.resolve(__dirname, "../../docs/spell/LEXICON-SOURCE-DECISIONS.md");
fs.writeFileSync(out, renderSourceDecisions());
console.log(`wrote ${path.relative(process.cwd(), out)}`);
