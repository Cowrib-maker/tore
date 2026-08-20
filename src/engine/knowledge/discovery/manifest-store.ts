import {
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";

import {
  LEGALINFO_MANIFEST_VERSION,
  type LegalInfoManifest,
  type LegalInfoManifestDocument,
} from "./types";

export interface ILegalInfoManifestStore {
  load(): Promise<LegalInfoManifest | null>;
  save(manifest: LegalInfoManifest): Promise<void>;
}

export function createEmptyManifest(
  categoryIds: readonly string[],
  now: () => Date = () => new Date(),
): LegalInfoManifest {
  const stamp = now().toISOString();
  return {
    version: LEGALINFO_MANIFEST_VERSION,
    createdAt: stamp,
    updatedAt: stamp,
    source: "legalinfo.mn",
    categoryIds: [...categoryIds],
    documents: [],
    checkpoint: {
      lastProcessedLawId: null,
      lastDiscoveryPageByCategory: {},
    },
  };
}

/**
 * Atomic JSON manifest persistence for discovery + resumable ingestion.
 * Mutable checkpoint state lives here (not in ArchiveService).
 */
export class FileLegalInfoManifestStore implements ILegalInfoManifestStore {
  constructor(private readonly path: string) {}

  async load(): Promise<LegalInfoManifest | null> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as LegalInfoManifest;
      return validateManifest(parsed);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async save(manifest: LegalInfoManifest): Promise<void> {
    const validated = validateManifest(manifest);
    await mkdir(dirname(this.path), { recursive: true });
    const tmpPath = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    const payload = `${JSON.stringify(validated, null, 2)}\n`;
    await writeFile(tmpPath, payload, "utf8");
    await replaceFileAtomically(tmpPath, this.path);
  }
}

/**
 * Replace dest with tmpPath. On Windows, rename-over-existing often raises
 * EPERM; fall back to move-aside then rename, then copy overwrite.
 */
async function replaceFileAtomically(
  tmpPath: string,
  destPath: string,
): Promise<void> {
  try {
    await rename(tmpPath, destPath);
    return;
  } catch (error) {
    if (!isReplaceBusyError(error)) {
      await unlink(tmpPath).catch(() => undefined);
      throw error;
    }
  }

  const backupPath = `${destPath}.${process.pid}.bak`;
  try {
    await unlink(backupPath).catch(() => undefined);
    try {
      await rename(destPath, backupPath);
    } catch (error) {
      if (!isNotFound(error)) {
        await copyFile(tmpPath, destPath);
        await unlink(tmpPath).catch(() => undefined);
        return;
      }
    }
    await rename(tmpPath, destPath);
    await unlink(backupPath).catch(() => undefined);
  } catch (error) {
    try {
      await copyFile(tmpPath, destPath);
      await unlink(tmpPath).catch(() => undefined);
      await unlink(backupPath).catch(() => undefined);
    } catch {
      await unlink(tmpPath).catch(() => undefined);
      throw error;
    }
  }
}

function isReplaceBusyError(error: unknown): boolean {
  if (typeof error !== "object" || error == null || !("code" in error)) {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === "EPERM" || code === "EEXIST" || code === "EACCES";
}

/** In-memory store for unit tests. */
export class InMemoryLegalInfoManifestStore implements ILegalInfoManifestStore {
  private manifest: LegalInfoManifest | null = null;

  constructor(initial?: LegalInfoManifest | null) {
    this.manifest = initial ? structuredClone(initial) : null;
  }

  async load(): Promise<LegalInfoManifest | null> {
    return this.manifest ? structuredClone(this.manifest) : null;
  }

  async save(manifest: LegalInfoManifest): Promise<void> {
    this.manifest = structuredClone(validateManifest(manifest));
  }
}

function validateManifest(manifest: LegalInfoManifest): LegalInfoManifest {
  if (manifest.version !== LEGALINFO_MANIFEST_VERSION) {
    throw new Error(`Unsupported manifest version: ${String(manifest.version)}`);
  }
  if (!Array.isArray(manifest.documents)) {
    throw new Error("Manifest documents must be an array");
  }
  for (const doc of manifest.documents) {
    assertDocument(doc);
  }
  return manifest;
}

function assertDocument(doc: LegalInfoManifestDocument): void {
  if (!doc.lawId || !doc.officialUrl || !doc.status || !doc.discoveredAt) {
    throw new Error("Manifest document is missing required fields");
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
