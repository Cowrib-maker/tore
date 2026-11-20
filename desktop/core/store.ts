import fs from "node:fs";
import path from "node:path";

/**
 * Secret protection is injected: Electron main passes `safeStorage`
 * (DPAPI on Windows). There is deliberately no default — a missing protector
 * is a configuration error, never a silent plaintext fallback.
 */
export interface SecretProtector {
  protect(plain: Buffer): string;
  unprotect(stored: string): Buffer;
}

/** Persistent document storage (small JSON). */
export interface DocumentStore<T> {
  read(): T | null;
  write(value: T): void;
  clear(): void;
}

export class MemoryStore<T> implements DocumentStore<T> {
  private value: T | null = null;
  read() {
    return this.value === null ? null : (JSON.parse(JSON.stringify(this.value)) as T);
  }
  write(value: T) {
    this.value = JSON.parse(JSON.stringify(value)) as T;
  }
  clear() {
    this.value = null;
  }
}

/**
 * Atomic JSON file store (write temp → rename) with a last-good backup.
 * A corrupt main file falls back to `<file>.bak` (the previous good write), so
 * a crash or a damaged disk sector never silently wipes the user's data; only
 * when both are unreadable does `read` return null.
 */
export class FileStore<T> implements DocumentStore<T> {
  constructor(private readonly file: string) {}
  private parse(file: string): T | null {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as T;
    } catch {
      return null;
    }
  }
  read(): T | null {
    return this.parse(this.file) ?? this.parse(`${this.file}.bak`);
  }
  write(value: T): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
    // Keep the previous GOOD file as the backup (never overwrite it with a corrupt one).
    if (this.parse(this.file) !== null) {
      try {
        fs.copyFileSync(this.file, `${this.file}.bak`);
      } catch {
        /* backup is best effort; the atomic rename below is what matters */
      }
    }
    fs.renameSync(tmp, this.file);
  }
  clear(): void {
    for (const f of [this.file, `${this.file}.bak`]) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* already gone */
      }
    }
  }
}
