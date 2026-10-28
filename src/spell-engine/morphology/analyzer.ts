import type { Lexicon, LexiconEntry } from "../lexicon/lexicon";
import {
  type Gender,
  type Harmony,
  type StemClass,
  harmonyOf,
  isVowel,
  stemClassOf,
  takesIForm,
} from "./phonology";
import {
  NOUN_CASE,
  NOUN_COLLECTIVE,
  NOUN_PLURAL,
  REFLEXIVE_AFTER_CONSONANT,
  REFLEXIVE_AFTER_GENITIVE,
  REFLEXIVE_AFTER_VOWEL,
  SOFT_I_CASE,
  SOFT_I_PLURAL,
  SOFT_I_REFLEXIVE,
  VERB_GROUPS,
  stemConditionHolds,
  type SuffixGroup,
  type Variant,
} from "./suffixes";

/**
 * Morphological analyser: lemma + licensed suffix chain.
 *
 * NOT a suffix stripper. A surface is VALID only if some lexicon lemma,
 * transformed by a real stem alternation (ь-stem → и-stem, vowel elision,
 * hidden г), takes a suffix chain that the grammar licenses for that stem's
 * class AND vowel harmony. A chain that matches except for ONE suffix of the
 * wrong vowel gender (or a д/т slip in a verbal ending) is reported as a
 * VIOLATION with an exact repaired surface — which is itself re-analysed and
 * discarded unless it is VALID.
 */

/**
 * Explanation of a verb parse: how the surface was built from the lemma.
 * Internal (not part of the public check response).
 */
export type VerbAnalysis = {
  lemma: string;
  /** The stem allomorph the suffix attached to (e.g. хөхөр- in хөхөрвөл). */
  stem: string;
  stemKind: VerbStemKind;
  /** The lemma's own linking vowel, when the stem is consonant-final. */
  linkingVowel: string | null;
  /** Suffix chain as written after the stem, with its grammatical tag. */
  chain: { tag: string; text: string }[];
};

export type MorphParse = {
  lemma: string;
  entry: LexiconEntry;
  tags: string[];
  /** Present for verb parses. */
  analysis?: VerbAnalysis;
};

export type ViolationKind = "HARMONY" | "CONSONANT_CONFUSION" | "STEM_VOWEL";

export type MorphViolation = {
  /** Harmony gender of the stem the suffix attached to (the analyzer's own reading, incl. verb linking vowels). */
  stemGender: "M" | "F" | "MIXED";
  lemma: string;
  entry: LexiconEntry;
  kind: ViolationKind;
  tags: string[];
  /** The offending suffix string as written, and what it should be. */
  observed: string;
  expected: string;
  /** Verified-valid corrected surfaces, best first. */
  repaired: string[];
};

export type MorphResult = {
  parses: MorphParse[];
  violations: MorphViolation[];
};

const EMPTY: MorphResult = { parses: [], violations: [] };

type Opt = {
  tag: string;
  s: string;
  swap?: { observed: string; own: string; alts: string[]; kind: ViolationKind };
};

type Ctx = {
  /** Verbs: is the stem's last non-neutral vowel о / ө / ё (strict labial harmony)? */
  lastRound?: boolean;
  /** Lexicon flags of the lemma (variants may require one, e.g. "cvb:ч"). */
  flags?: ReadonlySet<string>;
  /** Gender of the LEMMA (drives every suffix, including after a plural). */
  gender: Gender | "MIXED";
  h: Harmony;
  /** Surface used for iForm decisions (the stem as it appears). */
  stem: string;
};

/**
 * Lexical harmony override: harmony:M / harmony:F force a gender; «loan» marks a
 * loanword whose suffix vowels speakers do not agree on (клуб → клубаас / клубээс):
 * both are accepted and neither is ever accused.
 */
function forcedHarmony(flags: ReadonlySet<string>): Gender | "MIXED" | undefined {
  if (flags.has("loan")) return "MIXED";
  if (flags.has("harmony:M")) return "M";
  if (flags.has("harmony:F")) return "F";
  return undefined;
}

function genderOf(entry: LexiconEntry, lemma: string): Gender | "MIXED" {
  if (entry.flags.has("loan")) return "MIXED";
  if (entry.flags.has("harmony:M")) return "M";
  if (entry.flags.has("harmony:F")) return "F";
  return harmonyOf(lemma).gender;
}

function roundOk(g: Gender, h: Harmony): boolean {
  return g === "M" ? h.hasO : h.hasOE;
}

/** Own-gender strings licensed for this variant, honouring round/iForm gates. */
function ownStrings(vr: Variant, g: Gender, ctx: Ctx): string[] {
  const s = g === "M" ? vr.M : vr.F;
  if (s === null) return [];
  const round = vr.strict && ctx.lastRound !== undefined ? ctx.lastRound : roundOk(g, ctx.h);
  if (vr.round && !round) return [];
  if (vr.noRound && round) return [];
  if (vr.endsWith && !ctx.stem.endsWith(vr.endsWith)) return [];
  if (vr.notEndsWith && ctx.stem.endsWith(vr.notEndsWith)) return [];
  if (vr.flag && !ctx.flags?.has(vr.flag)) return [];
  if (vr.when && !stemConditionHolds(vr.when, ctx.stem)) return [];
  if (g === "M" && vr.mTakesF === "iForm" && !takesIForm(ctx.stem)) return [];
  return [s];
}

/**
 * optionsFor is a pure function of (tag, variants, the context features below). Memoised per variants array: the noun tables are
 * constants, so every noun chain after the first reuses the licensed options (it was a top-3 cost of an uncached word).
 * Features that ownStrings/optionsFor read: gender, hasO/hasOE, lastRound, the stem's last two letters, the stem's last vowel
 * (takesIForm) and the lemma flags.
 */
const OPTION_CACHE = new WeakMap<readonly Variant[], Map<string, Opt[]>>();

const FLAGS_KEY = new WeakMap<ReadonlySet<string>, string>();
function flagsKey(flags: ReadonlySet<string> | undefined): string {
  if (!flags || flags.size === 0) return "";
  let k = FLAGS_KEY.get(flags);
  if (k === undefined) FLAGS_KEY.set(flags, (k = [...flags].sort().join(",")));
  return k;
}

function lastVowelOfStem(stem: string): string {
  for (let i = stem.length - 1; i >= 0; i -= 1) if (isVowel(stem[i]!)) return stem[i]!;
  return "";
}

function optionsFor(tag: string, variants: readonly Variant[], ctx: Ctx): Opt[] {
  let byKey = OPTION_CACHE.get(variants);
  if (!byKey) OPTION_CACHE.set(variants, (byKey = new Map()));
  const flags = flagsKey(ctx.flags);
  const key = `${tag}|${ctx.gender}|${ctx.h.hasO ? 1 : 0}${ctx.h.hasOE ? 1 : 0}|${ctx.lastRound === undefined ? "-" : ctx.lastRound ? 1 : 0}|${ctx.stem.slice(-2)}|${lastVowelOfStem(ctx.stem)}|${flags}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const built = buildOptions(tag, variants, ctx);
  byKey.set(key, built);
  return built;
}

function buildOptions(tag: string, variants: readonly Variant[], ctx: Ctx): Opt[] {
  const out: Opt[] = [];
  const seen = new Set<string>();
  const push = (o: Opt) => {
    const k = `${o.s}|${o.swap ? "x" : ""}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(o);
    }
  };
  const genders: Gender[] = ctx.gender === "MIXED" ? ["M", "F"] : [ctx.gender];
  const ownAll = new Set<string>();
  for (const vr of variants) {
    for (const g of genders) {
      for (const s of ownStrings(vr, g, ctx)) {
        ownAll.add(s);
        push({ tag, s });
      }
    }
  }
  if (ctx.gender === "MIXED") return out; // never claim a harmony error
  const own: Gender = ctx.gender;
  const other: Gender = own === "M" ? "F" : "M";
  for (const vr of variants) {
    const wrong = other === "M" ? vr.M : vr.F;
    if (wrong === null || ownAll.has(wrong)) continue;
    // A gender-neutral string excluded by a stem condition (бare «-д» after х) is not a harmony slip.
    if (vr.M === vr.F) continue;
    // Counterpart in the stem's own gender: same variant, else its plain sibling.
    let counterpart: string | undefined = ownStrings(vr, own, ctx)[0];
    if (counterpart === undefined) {
      const sib = variants.find((x) => !x.round && ownStrings(x, own, ctx).length > 0);
      counterpart = sib ? ownStrings(sib, own, ctx)[0] : undefined;
    }
    if (counterpart === undefined) continue;
    // Labial siblings with the same consonant skeleton (тай → той for о-stems).
    const alts = [counterpart];
    for (const sib of variants) {
      if (!sib.round) continue;
      for (const cand of ownStrings(sib, own, ctx)) {
        if (cand !== counterpart && skeleton(cand) === skeleton(counterpart)) alts.push(cand);
      }
    }
    // Back-rounded stems (ном, хот): the labial form is the standard spelling.
    if (own === "M" && ctx.h.hasO && alts.length > 1) alts.push(alts.shift()!);
    push({ tag, s: wrong, swap: { observed: wrong, own: alts[0] ?? counterpart, alts, kind: "HARMONY" } });
  }
  return out;
}

function skeleton(s: string): string {
  return s.replace(/[аэиоөуүяеёюы]/gu, "V");
}

const VOWEL_LETTERS = ["а", "э", "и", "о", "ө", "у", "ү"] as const;

type VerbGroupPlan = { g: (typeof VERB_GROUPS)[number]; opts: Opt[]; repairOpts: Opt[] | null };
type VerbPlan = { ctx: Ctx; groups: VerbGroupPlan[] };

type BaseMode = "plain" | "soft-i" | "elided" | "hiddenG" | "vdrop";

type NounMatch = { tags: string[]; swap?: NonNullable<Opt["swap"]>; repairedSuffixes: string[] };

function matchNounChain(
  baseClass: StemClass | "SOFTI",
  rest: string,
  ctx: Ctx,
  mode: BaseMode,
  allowPlural: boolean,
  nominalized = false,
): NounMatch[] {
  const results: NounMatch[] = [];
  const plurals: (Opt | null)[] = [null];
  if (nominalized) {
    // after «-ынх»: the collective (хотынхон, багийнхан) is the only «plural» of a person-group noun besides ууд/үүд
    for (const o of optionsFor("COLL", NOUN_COLLECTIVE, ctx)) plurals.push(o);
  }
  if (allowPlural) {
    const variants = baseClass === "SOFTI" ? SOFT_I_PLURAL : NOUN_PLURAL[baseClass as StemClass];
    for (const o of optionsFor("PL", variants, ctx)) {
      // «-ид» is the plural of -ч/-ж/-ш person nouns only.
      if (o.s === "ид" && !/[чжш]$/u.test(ctx.stem)) continue;
      plurals.push(o);
    }
  }
  for (const pl of plurals) {
    if (pl && !rest.startsWith(pl.s)) continue;
    const afterPl = pl ? rest.slice(pl.s.length) : rest;
    // After a plural the stem ends in a consonant (…уд/…үд/…нууд).
    const caseClass: StemClass | "SOFTI" = pl ? "C" : baseClass;
    const groups: readonly SuffixGroup[] =
      caseClass === "SOFTI" ? SOFT_I_CASE : NOUN_CASE[caseClass as StemClass];
    const cases: (Opt | null)[] = [null];
    for (const g of groups) {
      if (mode === "hiddenG" && (g.tag === "DAT" || g.tag === "COM" || g.tag === "PRIV")) continue;
      for (const o of optionsFor(g.tag, g.variants, ctx)) cases.push(o);
    }
    for (const cs of cases) {
      if (cs && !afterPl.startsWith(cs.s)) continue;
      const afterCase = cs ? afterPl.slice(cs.s.length) : afterPl;
      // R-GEN-NMLZ-X: genitive + «х» = «the one of …» (a consonant stem again; no harmony slip is ever claimed inside it).
      if (!nominalized && cs?.tag === "GEN" && !cs.swap && !pl?.swap && afterCase.startsWith("х")) {
        const tail = afterCase.slice(1);
        const tags = [...(pl ? [pl.tag] : []), "GEN", "NMLZ"];
        if (tail === "") results.push({ tags, repairedSuffixes: [] });
        else {
          const nctx: Ctx = { ...ctx, stem: `${ctx.stem}${pl?.s ?? ""}${cs.s}х` };
          for (const m of matchNounChain("C", tail, nctx, "plain", true, true)) if (!m.swap) results.push({ tags: [...tags, ...m.tags], repairedSuffixes: [] });
        }
      }
      const refl: (Opt | null)[] = [null];
      if (cs?.tag !== "PRIV") {
        const prevEnd = (pl?.s ?? "") + (cs?.s ?? "");
        const last = prevEnd[prevEnd.length - 1] ?? "";
        const reflVariants: Variant[] = [];
        if (baseClass === "SOFTI" && prevEnd === "") reflVariants.push(...SOFT_I_REFLEXIVE);
        if (cs?.tag === "GEN") reflVariants.push(...REFLEXIVE_AFTER_GENITIVE);
        if (last === "й" || (last !== "" && isVowel(last))) reflVariants.push(...REFLEXIVE_AFTER_VOWEL);
        else if (prevEnd === "") {
          // Bare base: depends on the base's own ending.
          if (baseClass !== "SOFTI") {
            const baseVowel = baseClass === "V" || baseClass === "Y";
            reflVariants.push(...(baseVowel ? REFLEXIVE_AFTER_VOWEL : REFLEXIVE_AFTER_CONSONANT));
          }
        } else reflVariants.push(...REFLEXIVE_AFTER_CONSONANT);
        for (const o of optionsFor("REFL", reflVariants, ctx)) refl.push(o);
      }
      for (const rf of refl) {
        if (!rf) {
          if (afterCase !== "") continue;
        } else if (afterCase !== rf.s) continue;
        const parts = [pl, cs, rf].filter((x): x is Opt => x !== null);
        if (parts.length === 0) continue;
        // Vowel elision only before a vowel-initial first suffix.
        if (mode === "elided" || mode === "vdrop") {
          const first = parts[0]!.s[0] ?? "";
          if (!isVowel(first)) continue;
        }
        const swaps = parts.filter((p) => p.swap);
        if (swaps.length > 1) continue;
        const sw = swaps[0]?.swap;
        const repairedSuffixes = sw
          ? sw.alts.map((alt) => parts.map((p) => (p.swap ? alt : p.s)).join(""))
          : [];
        results.push({ tags: parts.map((p) => p.tag), swap: sw, repairedSuffixes });
      }
    }
  }
  return results;
}

/**
 * VERB STEM MODEL
 *
 * A «-х» lemma is stem + [linking vowel] + х. Its stem class decides which
 * surface allomorph each suffix attaches to:
 *
 *  NATIVE  vowel/й-final stem (хий-х, хөө-х, зулгаа-х): every suffix attaches
 *          directly (afterV variants).
 *  BASE    consonant-final stem (зур-а-х, ир-э-х, бич-и-х): the linking vowel L
 *          appears before vowel-initial suffixes (зур-ав, бич-ив); consonant-
 *          initial suffixes attach directly (зур-сан) — unless the stem ends in
 *          a cluster whose first consonant is a «заримдаг» (see EPENTHETIC).
 *  EPENTHETIC  hidden-vowel stem: a cluster C1C2 with C1 ∈ д т ж з с ш ц ч х
 *          cannot stand before a consonant, so the root surfaces with a vowel
 *          between them (нотл-ох → нотол-сон; эхл-эх → эхэл-сэн; нэхэмжл-эх →
 *          нэхэмжил-сэн). The vowel is и after ш/ж/ч, otherwise it copies the
 *          stem's harmony (о/ө/а/э); a lemma flag «hv:<vowel>» overrides it.
 *          Vowel-initial suffixes still use the bare stem (хөхр-өв).
 *  VOWEL_STEM  lemma flag «vstem»: the stem keeps its vowel before consonant-
 *          initial suffixes (ажилла-сан, not ажилл-сан). Vowel-initial suffixes
 *          use BASE (ажилл-ав).
 *  SOFT_I / SOFT_SIGN  lemma flag «soft-i» (барих, хорих, ярих): before в л м н
 *          the stem is бари- (баривал, барилгүй, баримаар); before с т ц ч д з and
 *          the hortative я/ё it is барь- (барьсан, барьтал, барьчих, барья).
 *          Vowel-initial suffixes use BASE (бар-ив).
 *
 * The class cannot be read off the spelling (ажиллах → ажилласан but
 * танилцах → танилцсан), so «vstem» is lexicon data. Without a flag the
 * default is BASE/EPENTHETIC; a form needing an unflagged class is simply
 * not recognised (UNKNOWN), never guessed.
 */
export type VerbStemKind = "NATIVE" | "BASE" | "EPENTHETIC" | "VOWEL_STEM" | "SOFT_I" | "SOFT_SIGN";

type VerbAllomorph = {
  stem: string;
  kind: VerbStemKind;
  lemma: string;
  entry: LexiconEntry;
  /** Linking vowel of a consonant-final stem (null for NATIVE stems). */
  link: string | null;
  /** BASE only: may consonant-initial suffixes attach to this allomorph? */
  consonantInitialOk: boolean;
  /** The lemma's own stem (without linking vowel / allomorph changes). */
  base: string;
  /**
   * BASE allomorphs only: when the lexicon EXPLICITLY says the stem needs a
   * vowel before consonant-initial suffixes (flag vstem / hv:<v>), the stem to
   * repair to. Absent for default-class lemmas: nothing is claimed about them.
   */
  repairStem?: string;
  /** Derived «<stem>чих» auxiliary stem: matched for parses only. */
  aux?: boolean;
};

/**
 * Endings licensed after the «чих» auxiliary. Measured against the second-opinion dictionary over 798 lexicon verbs (2026-10-08): these accept
 * ≥90% (the round converb «-оод» 47%, attested ~0.01% of news); the remaining endings (vowel-initial converbs / imperatives / «чих» again) are
 * accepted for ≤30% or 0% and stay UNKNOWN: ирчихэв, болчихчих, болчихаач are NOT licensed.
 */
const AUX_CHIH_ENDINGS = new Set(
  "сан сэн сон сөн даг дэг дог дөг лаа лээ лоо лөө жээ вал вэл вол вөл тал тэл тол төл магц мэгц могц мөгц саар сээр соор сөөр маар мээр моор мөөр оод".split(" "),
);

const LINKING_VOWELS = "аэоөиуү";
const HIDDEN_VOWEL_CLUSTER_START = "дтжзсшцчх";
const CONSONANT_LETTER = /^[бвгджзклмнпрстфхцчшщ]$/u;

/** Stem + linking vowel of a «-х» lemma; null when it is not a verb lemma. */
function verbStemOf(lemma: string): { stem: string; link: string | null } | null {
  if (!lemma.endsWith("х") || lemma.length < 3) return null;
  const a = lemma[lemma.length - 2]!;
  const b = lemma[lemma.length - 3]!;
  if (LINKING_VOWELS.includes(a) && !isVowel(b) && b !== "й") return { stem: lemma.slice(0, -2), link: a };
  return { stem: lemma.slice(0, -1), link: null };
}

/** Does this consonant-final stem need a hidden vowel before consonant-initial suffixes? */
function needsHiddenVowel(stem: string): boolean {
  const n = stem.length;
  if (n < 3) return false;
  const c1 = stem[n - 2]!;
  const c2 = stem[n - 1]!;
  return CONSONANT_LETTER.test(c1) && CONSONANT_LETTER.test(c2) && c1 !== c2 && HIDDEN_VOWEL_CLUSTER_START.includes(c1);
}

/**
 * Two final consonants that are both «эгшигт» (м н г л б в р, §16 of the
 * orthography): the stem may keep a vowel (шалгасан, ажилласан), hide one
 * (амарсан) or attach directly. The spelling does not say which, so without a
 * lexicon flag (vstem / hv:<v> / soft-i / direct) consonant-initial suffixes
 * are NOT accepted — vowel-initial suffixes are identical under every class.
 */
const SONORANTS = "мнглбвр";
function isAmbiguousSonorantCluster(stem: string): boolean {
  const n = stem.length;
  return n >= 3 && SONORANTS.includes(stem[n - 1]!) && SONORANTS.includes(stem[n - 2]!);
}

/** The hidden vowel inserted between the two final consonants. */
export function hiddenVowelFor(stem: string, flags: ReadonlySet<string>): string {
  for (const f of flags) if (f.startsWith("hv:") && f.length === 4) return f[3]!;
  const c1 = stem[stem.length - 2]!;
  if ("шжч".includes(c1)) return "и";
  let last = "";
  for (const ch of stem) if (isVowel(ch)) last = ch;
  if (last === "о") return "о";
  if (last === "ө") return "ө";
  return harmonyOf(stem).gender === "F" ? "э" : "а";
}

function verbAllomorphsOf(entry: LexiconEntry): VerbAllomorph[] {
  const info = verbStemOf(entry.key);
  if (!info || info.stem.length < 1) return [];
  const { stem, link } = info;
  const lemma = entry.key;
  if (link === null) return [{ stem, kind: "NATIVE", lemma, entry, link: null, consonantInitialOk: true, base: stem }];
  const out: VerbAllomorph[] = [];
  if (entry.flags.has("soft-i")) {
    out.push({ stem, kind: "BASE", lemma, entry, link, consonantInitialOk: false, base: stem });
    out.push({ stem: stem + link, kind: "SOFT_I", lemma, entry, link, consonantInitialOk: true, base: stem });
    out.push({ stem: stem + "ь", kind: "SOFT_SIGN", lemma, entry, link, consonantInitialOk: true, base: stem });
    return out;
  }
  if (entry.flags.has("vstem")) {
    out.push({ stem, kind: "BASE", lemma, entry, link, consonantInitialOk: false, base: stem, repairStem: stem + link });
    out.push({ stem: stem + link, kind: "VOWEL_STEM", lemma, entry, link, consonantInitialOk: true, base: stem });
    return out;
  }
  const explicitHv = [...entry.flags].some((f) => f.startsWith("hv:"));
  if (explicitHv || needsHiddenVowel(stem)) {
    const v = hiddenVowelFor(stem, entry.flags);
    const hidden = stem.slice(0, -1) + v + stem.slice(-1);
    out.push({ stem, kind: "BASE", lemma, entry, link, consonantInitialOk: false, base: stem, ...(explicitHv ? { repairStem: hidden } : {}) });
    out.push({ stem: hidden, kind: "EPENTHETIC", lemma, entry, link, consonantInitialOk: true, base: stem });
    return out;
  }
  const direct = entry.flags.has("direct") || !isAmbiguousSonorantCluster(stem);
  out.push({ stem, kind: "BASE", lemma, entry, link, consonantInitialOk: direct, base: stem });
  return out;
}

function expandLink(variants: readonly Variant[], link: string | null): Variant[] {
  const out: Variant[] = [];
  for (const vr of variants) {
    const needs = (vr.M ?? "").includes("~") || (vr.F ?? "").includes("~");
    if (!needs) {
      out.push(vr);
      continue;
    }
    if (link === null) continue;
    out.push({ ...vr, M: vr.M?.replace("~", link) ?? null, F: vr.F?.replace("~", link) ?? null });
  }
  return out;
}

const startsWithVowel = (s: string) => isVowel(s[0] ?? "");
/** Initial letters taking the бари- stem / the барь- stem of a «soft-i» verb. */
const SOFT_I_INITIALS = "влмн";
const SOFT_SIGN_INITIALS = "стцчдз";

/** Strict labial harmony: the stem's last non-neutral vowel is о / ө / ё. */
function lastRoundOf(stem: string): boolean {
  for (let i = stem.length - 1; i >= 0; i -= 1) {
    const ch = stem[i]!;
    if (ch === "и" || !isVowel(ch)) continue;
    return ch === "о" || ch === "ө" || ch === "ё";
  }
  return false;
}

export class MorphAnalyzer {
  private readonly verbForms = new Map<string, VerbAllomorph[]>();
  private readonly cache = new Map<string, MorphResult>();

  /**
   * Cheap necessary conditions for the stem-alternation paths in collect() (each is a SUPERSET filter: a hit still goes through
   * paradigmEntries): which prefixes could be an elided / vowel-dropped / ь-softened / hidden-г base of some lexicon key. They replace
   * ~13 failed lexicon lookups per candidate split with one Set probe — the largest cost of analysing a word that is NOT a lemma.
   */
  private readonly elidedBases = new Set<string>();
  private readonly vowelDropBases = new Set<string>();
  private readonly softBases = new Set<string>();
  private readonly hiddenGBases = new Set<string>();

  constructor(private readonly lex: Lexicon) {
    for (const key of lex.keys()) {
      const n = key.length;
      if (n >= 3) {
        const last = key[n - 1]!;
        if (isVowel(key[n - 2]!) && !isVowel(last)) this.elidedBases.add(key.slice(0, n - 2) + last);
        if ("аэоө".includes(last)) this.vowelDropBases.add(key.slice(0, -1));
        if (last === "ь") this.softBases.add(key.slice(0, -1));
        if (last === "н") this.hiddenGBases.add(`${key}г`);
      }
      for (const entry of lex.lookup(key)) {
        if (entry.pos !== "V" || entry.formOnly) continue;
        for (const allo of verbAllomorphsOf(entry)) {
          const list = this.verbForms.get(allo.stem);
          if (list) list.push(allo);
          else this.verbForms.set(allo.stem, [allo]);
        }
      }
    }
  }

  analyze(surface: string): MorphResult {
    const hit = this.cache.get(surface);
    if (hit) return hit;
    const res = this.compute(surface);
    if (this.cache.size > 20_000) this.cache.clear();
    this.cache.set(surface, res);
    return res;
  }

  private isValid(surface: string): boolean {
    return this.lex.has(surface) || this.collect(surface).parses.length > 0;
  }

  private compute(surface: string): MorphResult {
    if (surface.length < 2) return EMPTY;
    if (surface.length < 3 && !this.verbForms.has(surface)) return EMPTY;
    const { parses, violations } = this.collect(surface);
    if (parses.length > 0) return { parses, violations: [] };
    // Every repaired surface must itself be VALID, or we stay silent.
    const verified: MorphViolation[] = [];
    for (const v of violations) {
      const ok = v.repaired.filter((r) => r !== surface && this.isValid(r));
      if (ok.length > 0) verified.push({ ...v, repaired: ok });
    }
    if (verified.length === 0) return EMPTY;
    // Two different underlying diagnoses (different lemma or different
    // primary correction) are ambiguous: we do not guess between them.
    const primary = new Set(verified.map((v) => v.repaired[0]));
    if (primary.size !== 1) return EMPTY;
    return { parses: [], violations: verified };
  }

  private collect(surface: string): MorphResult {
    const parses: MorphParse[] = [];
    const violations: MorphViolation[] = [];
    const n = surface.length;

    // Bare stem = 2nd-person imperative (бич!, ав!, ажилла!, нотол!). Zero-marked
    // inflection: it must be exactly the allomorph a consonant-initial suffix would use.
    for (const allo of this.verbForms.get(surface) ?? []) {
      const ok =
        allo.kind === "NATIVE" ||
        allo.kind === "EPENTHETIC" ||
        allo.kind === "VOWEL_STEM" ||
        allo.kind === "SOFT_I" ||
        (allo.kind === "BASE" && allo.consonantInitialOk);
      if (ok) {
        parses.push({
          lemma: allo.lemma,
          entry: allo.entry,
          tags: ["IMP_BARE"],
          analysis: { lemma: allo.lemma, stem: allo.stem, stemKind: allo.kind, linkingVowel: allo.link, chain: [{ tag: "IMP_BARE", text: "" }] },
        });
      }
    }

    const addNoun = (
      entry: LexiconEntry,
      lemma: string,
      base: string,
      baseClass: StemClass | "SOFTI",
      rest: string,
      mode: BaseMode,
      allowPlural: boolean,
    ) => {
      const ctx: Ctx = {
        gender: genderOf(entry, lemma),
        h: harmonyOf(lemma, forcedHarmony(entry.flags)),
        stem: base,
      };
      // «no-plural»: a pseudo-lemma that IS the plural stem (зохиолчид) takes no second plural (зохиолчидууд ✗).
      for (const m of matchNounChain(baseClass, rest, ctx, mode, allowPlural && !entry.flags.has("no-plural"))) {
        if (!m.swap) {
          parses.push({ lemma, entry, tags: m.tags });
        } else {
          violations.push({
            lemma,
            entry,
            stemGender: ctx.h.gender,
            kind: m.swap.kind,
            tags: m.tags,
            observed: m.swap.observed,
            expected: m.swap.own,
            repaired: m.repairedSuffixes.map((x) => base + x),
          });
        }
      }
    };

    // R-HIDDEN-G-ACC: the bare accusative of a hidden-г noun is «lemma + г» (тайлан → тайланг, цалин → цалинг, үзэсгэлэн → үзэсгэлэнг, байшин → байшинг).
    // ~700 news tokens; the hidden-г flag is the evidence, so this never touches an unflagged lemma.
    if (surface.length >= 5 && surface.endsWith("г")) {
      for (const e of this.lex.paradigmEntries(surface.slice(0, -1))) {
        if (e.pos !== "V" && e.flags.has("hidden-g")) parses.push({ lemma: surface.slice(0, -1), entry: e, tags: ["ACC"] });
      }
    }
    for (let i = n - 1; i >= 2; i -= 1) {
      const prefix = surface.slice(0, i);
      const rest = surface.slice(i);

      // (a) plain lemma
      for (const e of this.lex.paradigmEntries(prefix)) {
        // hidden-г nouns never take a vowel-initial suffix directly (байшингаас, not байшинаас)
        if (e.flags.has("hidden-g") && isVowel(rest[0] ?? "")) continue;
        if (e.pos === "V") addNoun(e, prefix, prefix, "C", rest, "plain", false);
        else addNoun(e, prefix, prefix, stemClassOf(prefix), rest, "plain", true);
      }
      // (b) ь-stem in its «и»-form: хуули- ← хууль
      if (prefix.endsWith("и") && prefix.length >= 3 && this.softBases.has(prefix.slice(0, -1))) {
        const lemma = `${prefix.slice(0, -1)}ь`;
        for (const e of this.lex.paradigmEntries(lemma)) {
          if (e.pos === "V") continue;
          addNoun(e, lemma, prefix, "SOFTI", rest, "soft-i", true);
        }
      }
      // (b2) и/е-final lemma behaves like the soft «и»-stem: химийн, экологиор, үеийн
      if (/[ие]$/u.test(prefix) && prefix.length >= 2) {
        for (const e of this.lex.paradigmEntries(prefix)) {
          if (e.pos === "V") continue;
          // two-letter lemmas never ground a guess unless explicitly flagged (үе → үеийн, үеийг, үеэс)
          if (prefix.length < 3 && !e.flags.has("soft-i")) continue;
          addNoun(e, prefix, prefix, "SOFTI", rest, "soft-i", true);
        }
      }
      // (c) vowel elision: ажл- ← ажил, хэрг- ← хэрэг. Only stems of 4+ letters elide: хот, ном, гэр,
      // хүн never do (M1.1: «хтын» was accepted as a form of хот).
      if (prefix.length >= 3 && isVowel(rest[0] ?? "") && this.elidedBases.has(prefix) && /[бвгджзклмнпрстфхцчшщ]{2}$/u.test(prefix)) {
        for (const v of VOWEL_LETTERS) {
          const lemma = `${prefix.slice(0, -1)}${v}${prefix.slice(-1)}`;
          for (const e of this.lex.paradigmEntries(lemma)) {
            if (e.pos === "V") continue;
            addNoun(e, lemma, prefix, "C", rest, "elided", true);
          }
        }
      }
      // (c2) short final vowel dropped: хандлага + ын → хандлагын
      if (isVowel(rest[0] ?? "") && !isVowel(prefix[prefix.length - 1] ?? "") && this.vowelDropBases.has(prefix)) {
        for (const v of ["а", "э", "о", "ө"] as const) {
          const lemma = `${prefix}${v}`;
          for (const e of this.lex.paradigmEntries(lemma)) {
            if (e.pos === "V") continue;
            addNoun(e, lemma, prefix, "C", rest, "vdrop", true);
          }
        }
      }
      // (d) hidden г: байшингийн ← байшин
      if (prefix.endsWith("г") && prefix.length >= 4 && this.hiddenGBases.has(prefix)) {
        const lemma = prefix.slice(0, -1);
        for (const e of this.lex.paradigmEntries(lemma)) {
          if (e.pos === "V" || !e.flags.has("hidden-g")) continue;
          addNoun(e, lemma, prefix, "C", rest, "hiddenG", true);
        }
      }
      // (e) verb stems
      const allos = this.verbForms.get(prefix);
      if (allos) for (const allo of allos) this.matchVerb(allo, rest, parses, violations);
    }
    return { parses, violations };
  }

  /**
   * Everything about an allomorph that does NOT depend on the suffix string being matched (harmony context and the licensed
   * suffix options per group). Built once per allomorph: optionsFor/expandLink were ~60% of the time of every uncached word.
   */
  private readonly verbPlans = new WeakMap<VerbAllomorph, VerbPlan>();

  private verbPlan(allo: VerbAllomorph): VerbPlan {
    const cached = this.verbPlans.get(allo);
    if (cached) return cached;
    const { entry, lemma, stem } = allo;
    // The linking vowel и (барих, унших, хорих) is neutral and must not turn a back-vowel stem into a
    // «mixed» one (last vowel и), so harmony is read from the stem alone. Any other linking vowel
    // belongs to the lemma's harmony (ажиллах: the final а). A stem with no vowel falls back to the lemma.
    const forced = forcedHarmony(entry.flags);
    const harmonyWord = allo.link === "и" && [...allo.base].some((ch) => isVowel(ch)) ? allo.base : lemma;
    const h = harmonyOf(harmonyWord, forced);
    // Stem conditions (р/в/л …) are about the root consonant, not the ь of a soft stem.
    const ctx: Ctx = {
      gender: h.gender,
      h,
      stem: allo.kind === "SOFT_SIGN" ? allo.base : stem,
      lastRound: lastRoundOf(allo.base),
      flags: entry.flags,
    };
    const last = stem[stem.length - 1] ?? "";
    const vowelFinal = last === "й" || isVowel(last);
    const lexicalConverb = entry.flags.has("cvb:ж") || entry.flags.has("cvb:ч");
    const groups: VerbGroupPlan[] = [];
    for (const g of VERB_GROUPS) {
      // A lemma that lexically takes the bare converb (явж, авч) does not take the linked one (яваж).
      if (g.tag === "CVB_J" && lexicalConverb && !vowelFinal) continue;
      const raw =
        allo.kind === "SOFT_SIGN"
          ? [...g.afterC, ...g.afterV.filter((x) => x.vstemOk)]
          : vowelFinal
            ? g.afterV
            : g.afterC;
      // «~» (linking vowel) is only meaningful after a consonant-final stem.
      const variants = expandLink(raw, allo.link);
      const opts = optionsFor(g.tag, variants, ctx).filter((o) => {
        const vowelInitial = startsWithVowel(o.s);
        switch (allo.kind) {
          case "NATIVE":
            return true;
          case "BASE":
            return vowelInitial || allo.consonantInitialOk;
          case "EPENTHETIC":
            return !vowelInitial;
          case "SOFT_I":
            return !vowelInitial && SOFT_I_INITIALS.includes(o.s[0] ?? "");
          case "SOFT_SIGN": {
            if (vowelInitial) return variants.some((vr) => vr.vstemOk && (vr.M === o.s || vr.F === o.s));
            return SOFT_SIGN_INITIALS.includes(o.s[0] ?? "");
          }
          case "VOWEL_STEM": {
            // consonant-initial suffixes, plus the hortative я/е/ё (ажилла-я).
            if (!vowelInitial) return true;
            return variants.some((vr) => vr.vstemOk && (vr.M === o.s || vr.F === o.s));
          }
        }
      });
      const repairOpts = allo.kind === "BASE" && allo.repairStem && !vowelFinal ? optionsFor(g.tag, expandLink(raw, allo.link), ctx) : null;
      groups.push({ g, opts, repairOpts });
    }
    const plan: VerbPlan = { ctx, groups };
    this.verbPlans.set(allo, plan);
    return plan;
  }

  /** Derived «<stem>чих» allomorphs (auxiliary chain), one per base allomorph. */
  private readonly auxAllomorphs = new WeakMap<VerbAllomorph, VerbAllomorph>();

  private matchVerb(allo: VerbAllomorph, rest: string, parses: MorphParse[], violations: MorphViolation[]): void {
    // R-AUX-CHIH: the perfective auxiliary «чих» builds a new consonant-final stem which takes the ordinary verb endings:
    // болчихсон, болчихоод, орчихсон, эхэлчихсэн, явчихсан (accepted by the second-opinion dictionary for 70% of verbs; ~0.14% of news tokens).
    // Only PARSES are taken from the derived stem: an auxiliary chain never produces a harmony / stem-vowel accusation.
    if (!allo.aux && rest.length > 4 && rest.startsWith("чих") && (allo.kind === "NATIVE" || allo.kind === "VOWEL_STEM" || allo.kind === "EPENTHETIC" || (allo.kind === "BASE" && allo.consonantInitialOk))) {
      let derived = this.auxAllomorphs.get(allo);
      if (!derived) {
        derived = { ...allo, stem: `${allo.stem}чих`, base: `${allo.base}чих`, kind: "NATIVE", consonantInitialOk: true, repairStem: undefined, aux: true };
        this.auxAllomorphs.set(allo, derived);
      }
      const tail = rest.slice(3);
      if (AUX_CHIH_ENDINGS.has(tail)) {
        const inner: MorphParse[] = [];
        this.matchVerb(derived, tail, inner, []);
        for (const p of inner) parses.push({ ...p, tags: ["AUX_CHIH", ...p.tags] });
      }
    }
    const { entry, lemma, stem } = allo;
    const plan = this.verbPlan(allo);
    const ctx = plan.ctx;
    const mkParse = (chain: { tag: string; text: string }[], tags: string[]): MorphParse => ({
      lemma,
      entry,
      tags,
      analysis: { lemma, stem, stemKind: allo.kind, linkingVowel: allo.link, chain },
    });
    for (const { g, opts, repairOpts } of plan.groups) {
      // Explicitly flagged lemma written without its stem vowel (ажиллсан, нотлсон).
      if (repairOpts && allo.repairStem) {
        for (const o of repairOpts) {
          if (o.swap || startsWithVowel(o.s) || rest !== o.s) continue;
          violations.push({
            lemma,
            entry,
            stemGender: ctx.h.gender,
            kind: "STEM_VOWEL",
            tags: [g.tag],
            observed: stem,
            expected: allo.repairStem,
            repaired: [allo.repairStem + o.s],
          });
        }
      }
      for (const o of opts) {
        if (rest === o.s) {
          if (!o.swap) parses.push(mkParse([{ tag: g.tag, text: o.s }], [g.tag]));
          else
            violations.push({
              lemma,
              entry,
              stemGender: ctx.h.gender,
              kind: o.swap.kind,
              tags: [g.tag],
              observed: o.swap.observed,
              expected: o.swap.own,
              repaired: o.swap.alts.map((a) => stem + a),
            });
        } else if (g.nominal && o.swap && rest.startsWith(o.s) && rest.length > o.s.length) {
          // Wrong-gender participle followed by a valid noun chain (авсэнгүй, бичсэнийг):
          // repair only the participle; the tail must itself be licensed.
          const tail = rest.slice(o.s.length);
          const nctx: Ctx = { ...ctx, stem: stem + o.swap.own };
          if (matchNounChain("C", tail, nctx, "plain", false).some((m) => !m.swap)) {
            violations.push({
              lemma,
              entry,
              stemGender: ctx.h.gender,
              kind: o.swap.kind,
              tags: [g.tag],
              observed: o.swap.observed,
              expected: o.swap.own,
              repaired: o.swap.alts.map((a) => stem + a + tail),
            });
          }
        } else if (g.nominal && !o.swap && rest.startsWith(o.s)) {
          // Verbal noun (бичсэн → бичсэнийг): noun suffixes after the participle.
          const base = stem + o.s;
          const tail = rest.slice(o.s.length);
          // байдагийг ✗ / мэддэгний ✗ — before a vowel-initial (or ны/ний) case suffix the elided байдгийг is the form (handled below);
          // the un-elided participle only takes the consonant-initial «гүй, т, тай/тэй/той/төй» (байдаггүй, байдагт, хийдэгтэй).
          if (g.elides && !/^(гүй|т|тай|тэй|той|төй)$/u.test(tail)) continue;
          const nctx: Ctx = { ...ctx, stem: base };
          for (const m of matchNounChain("C", tail, nctx, "plain", false)) {
            if (!m.swap) parses.push(mkParse([{ tag: g.tag, text: o.s }, { tag: m.tags.join("+"), text: tail }], [g.tag, ...m.tags]));
            else
              violations.push({
                lemma,
                entry,
                stemGender: ctx.h.gender,
                kind: m.swap.kind,
                tags: [g.tag, ...m.tags],
                observed: m.swap.observed,
                expected: m.swap.own,
                repaired: m.repairedSuffixes.map((x) => base + x),
              });
          }
        }
      }
      // R-PTCP-ELISION: a participle in -VC (сан сэн сон сөн даг дэг дог дөг) drops its vowel before a vowel-initial case suffix:
      // болсон → болсны, болсныг, болсноос; байдаг → байдгийг, хийдэг → хийдгийн. Only the nominal participles.
      if (g.nominal) {
        for (const o of opts) {
          if (o.swap || o.s.length < 3) continue;
          const lastCh = o.s[o.s.length - 1]!;
          const vow = o.s[o.s.length - 2]!;
          if (isVowel(lastCh) || !isVowel(vow)) continue;
          const el = o.s.slice(0, -2) + lastCh; // сон → сн, даг → дг
          if (!rest.startsWith(el) || rest.length === el.length) continue;
          const tail = rest.slice(el.length);
          if (!startsWithVowel(tail)) continue;
          const nctx: Ctx = { ...ctx, stem: stem + el };
          for (const m of matchNounChain("C", tail, nctx, "elided", false)) {
            if (!m.swap) parses.push(mkParse([{ tag: g.tag, text: o.s }, { tag: m.tags.join("+"), text: tail }], [g.tag, ...m.tags]));
          }
        }
      }
      if (g.consonantConfusion && ctx.gender !== "MIXED") {
        for (const o of opts) {
          if (o.swap || !o.s.endsWith("д")) continue;
          const slipped = `${o.s.slice(0, -1)}т`;
          if (rest === slipped) {
            violations.push({
              lemma,
              entry,
              stemGender: ctx.h.gender,
              kind: "CONSONANT_CONFUSION",
              tags: [g.tag],
              observed: slipped,
              expected: o.s,
              repaired: [stem + o.s],
            });
          }
        }
      }
    }
  }
}
