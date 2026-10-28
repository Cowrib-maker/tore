import type { LanguageEngine } from "./contracts";

/**
 * Engines are looked up by id so the active engine can be switched (or A/B
 * compared) by configuration without code changes in callers.
 */
export class EngineRegistry {
  private readonly engines = new Map<string, LanguageEngine>();
  private defaultId: string | null = null;

  register(engine: LanguageEngine, options: { makeDefault?: boolean } = {}): void {
    if (this.engines.has(engine.info.id)) {
      throw new Error(`Language engine already registered: ${engine.info.id}`);
    }
    this.engines.set(engine.info.id, engine);
    if (options.makeDefault || this.defaultId === null) {
      this.defaultId = engine.info.id;
    }
  }

  get(id?: string): LanguageEngine {
    const key = id ?? this.defaultId;
    const engine = key ? this.engines.get(key) : undefined;
    if (!engine) {
      throw new Error(`Language engine not registered: ${key ?? "(none)"}`);
    }
    return engine;
  }

  list(): readonly LanguageEngine[] {
    return [...this.engines.values()];
  }
}
