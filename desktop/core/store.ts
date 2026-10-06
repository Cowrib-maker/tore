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

/** Atomic JSON file store (write temp → rename). Corrupt files read as null. */
export class FileStore<T> implements DocumentStore<T> {
  constructor(private readonly file: string) {}
  read(): T | null {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf8")) as T;
    } catch {
      return null;
    }
  }
  write(value: T): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
  clear(): void {
    try {
      fs.unlinkSync(this.file);
    } catch {
      /* already gone */
    }
  }
}
