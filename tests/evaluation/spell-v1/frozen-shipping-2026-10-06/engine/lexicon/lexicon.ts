import type { LexiconLayer } from "../core/types";
import { normalizeToken } from "../tokenizer/normalize";
import { type DataPack, type Pos, SHIPPABLE_DATA_CLASSES, validatePack } from "./pack-schema";

export type LexiconEntry = {
  /** Normalised (lower-case) key. */
  key: string;
  /** Spelling as authored (keeps capitals for names/abbreviations). */
  display: string;
  pos: Pos;
  flags: ReadonlySet<string>;
  layer: LexiconLayer;
  packId: string;
  freq: number;
  /** True when this is an accepted surface form only (no paradigm). */
  formOnly: boolean;
};

export class PackValidationError extends Error {
  constructor(
    public readonly packId: string,
    public readonly problems: string[],
  ) {
    super(`Invalid data pack "${packId}": ${problems.slice(0, 5).join("; ")}`);
    this.name = "PackValidationError";
  }
}

export type LexiconOptions = {
  /** Restrict to these layers (default: all supplied packs). */
  layers?: readonly LexiconLayer[];
  /**
   * Allow class C/D (research / benchmark) packs. Off by default: such data may
   * be used on a developer's machine only and must never reach a product build.
   */
  allowResearchData?: boolean;
};

/**
 * In-memory lexicon built from validated data packs. Lookup is O(1) by
 * normalised surface; the same surface may carry several entries (layers /
 * parts of speech).
 */
export class Lexicon {
  private readonly byKey = new Map<string, LexiconEntry[]>();
  readonly packs: readonly { id: string; version: string; layer: LexiconLayer; coverage: "SEED" | "BROAD"; redistributable: boolean }[];
  readonly size: number;

  constructor(packs: readonly DataPack[], options: LexiconOptions = {}) {
    const meta: Lexicon["packs"][number][] = [];
    let size = 0;
    for (const pack of packs) {
      const problems = validatePack(pack);
      if (problems.length > 0) throw new PackValidationError(pack?.id ?? "?", problems);
      if (options.layers && !options.layers.includes(pack.layer)) continue;
      const dc = pack.provenance.dataClass;
      if (!options.allowResearchData && (dc ? !SHIPPABLE_DATA_CLASSES.includes(dc) : !pack.provenance.redistributable)) {
        throw new PackValidationError(pack.id, [`non-shippable data (${dc ?? "redistributable:false"}) refused: research data needs allowResearchData`]);
      }
      meta.push({
        id: pack.id,
        version: pack.version,
        layer: pack.layer,
        coverage: pack.coverage,
        redistributable: pack.provenance.redistributable,
      });
      for (const e of pack.entries) {
        const flags = new Set(e.flags ?? []);
        const key = normalizeToken(e.w);
        const entry: LexiconEntry = {
          key,
          display: e.w,
          pos: e.pos ?? "X",
          flags,
          layer: pack.layer,
          packId: pack.id,
          freq: e.freq ?? 1,
          formOnly: flags.has("form"),
        };
        const list = this.byKey.get(key);
        if (list) list.push(entry);
        else this.byKey.set(key, [entry]);
        size += 1;
      }
    }
    this.packs = meta;
    this.size = size;
  }

  /** All entries for a normalised surface. */
  lookup(key: string): readonly LexiconEntry[] {
    return this.byKey.get(key) ?? [];
  }

  has(key: string): boolean {
    return this.byKey.has(key);
  }

  /** Entries that can head a paradigm (not form-only, not closed-class). */
  paradigmEntries(key: string): readonly LexiconEntry[] {
    const list = this.byKey.get(key);
    if (!list) return [];
    return list.filter((e) => !e.formOnly && !e.flags.has("no-infl") && e.pos !== "PART" && e.pos !== "PRON" && e.pos !== "NUM");
  }

  keys(): IterableIterator<string> {
    return this.byKey.keys();
  }

  /** True when absence from the lexicon is meaningful evidence. */
  get hasBroadCoverage(): boolean {
    return this.packs.some((p) => p.coverage === "BROAD" && (p.layer === "GENERAL"));
  }

  get dataPackVersion(): string {
    return this.packs.map((p) => `${p.id}@${p.version}`).join("+") || "none";
  }
}
