/**
 * Release gate for data provenance. Pure functions, no I/O: used by the pack
 * builder, the `verify-license` stage and the unit tests.
 */
import { SOURCES, type SourceRecord, sourceById } from "./sources";

const SHIPPABLE_CLASSES = ["A_TORE_OWNED", "B_EXTERNAL_LICENSED"];

/** Internal consistency of the registry itself (a shippable source must prove it). */
export function validateRegistry(sources: readonly SourceRecord[] = SOURCES): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    if (seen.has(s.sourceId)) problems.push(`${s.sourceId}: duplicate sourceId`);
    seen.add(s.sourceId);
    const shippable = s.status === "VERIFIED_SHIPPABLE";
    if (shippable) {
      if (!SHIPPABLE_CLASSES.includes(s.dataClass)) problems.push(`${s.sourceId}: shippable source must be class A/B, is ${s.dataClass}`);
      if (!s.licenseText || s.licenseText.length < 20 || /no licence text/i.test(s.licenseText)) problems.push(`${s.sourceId}: shippable source needs a licence text`);
      for (const k of ["commercialUse", "redistribution", "derivativeWorks"] as const) {
        if (s[k] !== "YES") problems.push(`${s.sourceId}: shippable source must have ${k}=YES (is ${s[k]})`);
      }
      if (s.localUse !== "NONE") problems.push(`${s.sourceId}: shippable source should not be tagged for research/benchmark use`);
    } else {
      if (SHIPPABLE_CLASSES.includes(s.dataClass)) problems.push(`${s.sourceId}: class ${s.dataClass} requires status VERIFIED_SHIPPABLE`);
    }
    if (s.status === "UNVERIFIED" && s.licenseText === "") problems.push(`${s.sourceId}: UNVERIFIED sources must still say why in licenseText`);
  }
  return problems;
}

/** Throws unless every id is a known, VERIFIED_SHIPPABLE source. */
export function assertShippable(ids: readonly string[] | undefined, what: string): void {
  if (!ids || ids.length === 0) throw new Error(`REFUSED: ${what} declares no sourceIds (provenance is mandatory for release data)`);
  for (const id of ids) {
    const s = sourceById(id);
    if (!s) throw new Error(`REFUSED: ${what} cites unknown source "${id}"`);
    if (s.status !== "VERIFIED_SHIPPABLE") throw new Error(`REFUSED: ${what} cites ${id} (${s.status}) — only VERIFIED_SHIPPABLE data may enter a release pack`);
  }
}
