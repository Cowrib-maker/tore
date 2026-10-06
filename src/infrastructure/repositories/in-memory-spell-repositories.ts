import { randomUUID } from "node:crypto";

import type { SpellRepositories, SpellUnitOfWork } from "@/domain/ports/spell-unit-of-work";
import {
  SpellActiveActivationConflictError,
  type CreateSpellActivationInput,
  type EndSpellActivationInput,
  type SpellActivationRepository,
} from "@/domain/repositories/spell-activation-repository";
import type {
  AppendSpellEventInput,
  SpellLicenseEventRepository,
} from "@/domain/repositories/spell-event-repository";
import type {
  RecordSpellAttemptInput,
  SpellAttemptRepository,
  SpellNonceRepository,
} from "@/domain/repositories/spell-guard-repository";
import type {
  SpellInstallationRepository,
  UpsertSpellInstallationInput,
} from "@/domain/repositories/spell-installation-repository";
import type {
  CreateSpellLicenseInput,
  ListSpellLicensesInput,
  SpellLicenseRepository,
} from "@/domain/repositories/spell-license-repository";
import type {
  SpellActivation,
  SpellAttempt,
  SpellInstallation,
  SpellLicense,
  SpellLicenseEvent,
} from "@/domain/spell/entities";
import { SpellActivationStatus, SpellLicenseStatus } from "@/domain/spell/enums";

/**
 * In-memory twins of the Prisma Spell repositories for unit tests. They keep
 * the same invariants the database enforces (one ACTIVE activation per
 * license, conditional updates) and the unit of work rolls state back on
 * error, so use-case atomicity can be asserted without Postgres. Concurrency
 * against the real database is covered separately by tests/db.
 */
export class SpellMemoryState {
  licenses = new Map<string, SpellLicense>();
  installations = new Map<string, SpellInstallation>();
  activations = new Map<string, SpellActivation>();
  events: SpellLicenseEvent[] = [];
  attempts: SpellAttempt[] = [];
  nonces = new Map<string, Date>();

  snapshot() {
    return {
      licenses: new Map([...this.licenses].map(([k, v]) => [k, { ...v }])),
      installations: new Map([...this.installations].map(([k, v]) => [k, { ...v }])),
      activations: new Map([...this.activations].map(([k, v]) => [k, { ...v }])),
      events: this.events.map((e) => ({ ...e })),
    };
  }

  restore(s: ReturnType<SpellMemoryState["snapshot"]>) {
    this.licenses = s.licenses;
    this.installations = s.installations;
    this.activations = s.activations;
    this.events = s.events;
  }
}

class MemLicenses implements SpellLicenseRepository {
  constructor(private s: SpellMemoryState) {}
  async create(input: CreateSpellLicenseInput) {
    for (const l of this.s.licenses.values()) {
      if (l.codeHash === input.codeHash) throw new Error("duplicate code hash");
      if (input.purchaseInvoiceId && l.purchaseInvoiceId === input.purchaseInvoiceId) throw new Error("duplicate purchase invoice");
    }
    const now = new Date();
    const license: SpellLicense = {
      ...input,
      status: SpellLicenseStatus.ACTIVE,
      startsAt: null,
      expiresAt: null,
      lastDeviceChangeAt: null,
      revokedAt: null,
      revokedReason: null,
      createdAt: now,
      updatedAt: now,
    };
    this.s.licenses.set(license.id, license);
    return { ...license };
  }
  async findById(id: string) {
    const l = this.s.licenses.get(id);
    return l ? { ...l } : null;
  }
  async findByPurchaseInvoiceId(invoiceId: string) {
    for (const l of this.s.licenses.values()) {
      if (l.purchaseInvoiceId === invoiceId) return { ...l };
    }
    return null;
  }
  async findByCodeHashes(hashes: string[]) {
    for (const l of this.s.licenses.values()) {
      if (hashes.includes(l.codeHash)) return { ...l };
    }
    return null;
  }
  async listByOwner(ownerUserId: string) {
    return [...this.s.licenses.values()]
      .filter((l) => l.ownerUserId === ownerUserId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((l) => ({ ...l }));
  }
  async list(input: ListSpellLicensesInput) {
    const all = [...this.s.licenses.values()].filter(
      (l) =>
        (!input.status || l.status === input.status) &&
        (!input.planCode || l.planCode === input.planCode) &&
        (!input.source || l.source === input.source) &&
        (!input.ownerUserId || l.ownerUserId === input.ownerUserId),
    );
    return {
      items: all.slice(input.offset, input.offset + input.limit).map((l) => ({ ...l })),
      total: all.length,
    };
  }
  async startTerm(id: string, startsAt: Date, expiresAt: Date) {
    const l = this.s.licenses.get(id);
    if (!l || l.startsAt) return false;
    l.startsAt = startsAt;
    l.expiresAt = expiresAt;
    return true;
  }
  async setLastDeviceChangeAt(id: string, at: Date | null) {
    this.s.licenses.get(id)!.lastDeviceChangeAt = at;
  }
  async revoke(id: string, at: Date, reason: string) {
    const l = this.s.licenses.get(id);
    if (!l || l.status === SpellLicenseStatus.REVOKED) return false;
    l.status = SpellLicenseStatus.REVOKED;
    l.revokedAt = at;
    l.revokedReason = reason;
    return true;
  }
  async updateCodeCiphertext(id: string, ciphertext: Uint8Array, keyVersion: string) {
    const l = this.s.licenses.get(id)!;
    l.codeCiphertext = ciphertext;
    l.codeEncKeyVersion = keyVersion;
  }
}

class MemInstallations implements SpellInstallationRepository {
  constructor(private s: SpellMemoryState) {}
  async findById(id: string) {
    const i = this.s.installations.get(id);
    return i ? { ...i } : null;
  }
  async findByThumbprint(keyThumbprint: string) {
    for (const i of this.s.installations.values()) {
      if (i.keyThumbprint === keyThumbprint) return { ...i };
    }
    return null;
  }
  async upsert(input: UpsertSpellInstallationInput) {
    const existing = await this.findByThumbprint(input.keyThumbprint);
    if (existing) {
      const updated = {
        ...existing,
        platform: input.platform,
        appVersion: input.appVersion,
        machineHintHash: input.machineHintHash,
        lastSeenAt: input.now,
      };
      this.s.installations.set(existing.id, updated);
      return { ...updated };
    }
    const created: SpellInstallation = {
      id: randomUUID(),
      keyThumbprint: input.keyThumbprint,
      publicKey: input.publicKey,
      platform: input.platform,
      appVersion: input.appVersion,
      machineHintHash: input.machineHintHash,
      firstSeenAt: input.now,
      lastSeenAt: input.now,
      revokedAt: null,
    };
    this.s.installations.set(created.id, created);
    return { ...created };
  }
  async touch(id: string, now: Date) {
    this.s.installations.get(id)!.lastSeenAt = now;
  }
  async revoke(id: string, at: Date) {
    this.s.installations.get(id)!.revokedAt = at;
  }
}

class MemActivations implements SpellActivationRepository {
  constructor(private s: SpellMemoryState) {}
  private sorted(licenseId: string) {
    return [...this.s.activations.values()]
      .filter((a) => a.licenseId === licenseId)
      .sort(
        (a, b) =>
          b.activatedAt.getTime() - a.activatedAt.getTime() ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
  }
  async findById(id: string) {
    const a = this.s.activations.get(id);
    return a ? { ...a } : null;
  }
  async findActiveByLicenseId(licenseId: string) {
    const a = this.sorted(licenseId).find((x) => x.status === SpellActivationStatus.ACTIVE);
    return a ? { ...a } : null;
  }
  async findLatestByLicenseId(licenseId: string) {
    const a = this.sorted(licenseId)[0];
    return a ? { ...a } : null;
  }
  async listByLicenseId(licenseId: string) {
    return this.sorted(licenseId).map((a) => ({ ...a }));
  }
  async listActiveByInstallationId(installationId: string) {
    return [...this.s.activations.values()]
      .filter((a) => a.installationId === installationId && a.status === SpellActivationStatus.ACTIVE)
      .map((a) => ({ ...a }));
  }
  async create(input: CreateSpellActivationInput) {
    const clash = [...this.s.activations.values()].some(
      (a) => a.licenseId === input.licenseId && a.status === SpellActivationStatus.ACTIVE,
    );
    if (clash) throw new SpellActiveActivationConflictError();
    const activation: SpellActivation = {
      id: randomUUID(),
      licenseId: input.licenseId,
      installationId: input.installationId,
      userId: input.userId,
      status: SpellActivationStatus.ACTIVE,
      endReason: null,
      activatedAt: input.activatedAt,
      lastValidatedAt: input.activatedAt,
      deactivatedAt: null,
      supersededByActivationId: null,
      transferredFromActivationId: input.transferredFromActivationId,
      lastTokenJti: input.lastTokenJti,
      createdAt: new Date(),
    };
    this.s.activations.set(activation.id, activation);
    return { ...activation };
  }
  async end(input: EndSpellActivationInput) {
    const a = this.s.activations.get(input.id);
    if (!a || a.status !== SpellActivationStatus.ACTIVE) return false;
    a.status = input.status as SpellActivationStatus;
    a.endReason = input.reason;
    a.deactivatedAt = input.at;
    if (input.supersededByActivationId !== undefined) {
      a.supersededByActivationId = input.supersededByActivationId;
    }
    return true;
  }
  async recordValidation(id: string, at: Date, tokenJti: string) {
    const a = this.s.activations.get(id)!;
    a.lastValidatedAt = at;
    a.lastTokenJti = tokenJti;
  }
  async setSuperseded(id: string, supersededByActivationId: string) {
    this.s.activations.get(id)!.supersededByActivationId = supersededByActivationId;
  }
}

class MemEvents implements SpellLicenseEventRepository {
  constructor(private s: SpellMemoryState) {}
  async append(input: AppendSpellEventInput) {
    const event: SpellLicenseEvent = {
      id: randomUUID(),
      licenseId: input.licenseId,
      activationId: input.activationId ?? null,
      type: input.type,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      ipHash: input.ipHash ?? null,
      metadata: input.metadata ? structuredClone(input.metadata) : null,
      createdAt: input.createdAt,
    };
    this.s.events.push(event);
    return { ...event };
  }
  async listByLicenseId(licenseId: string, limit = 200) {
    return this.s.events
      .filter((e) => e.licenseId === licenseId)
      .slice()
      .reverse()
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }
}

export class InMemorySpellAttempts implements SpellAttemptRepository {
  constructor(private s: SpellMemoryState) {}
  async record(input: RecordSpellAttemptInput) {
    const attempt: SpellAttempt = {
      id: randomUUID(),
      kind: input.kind,
      outcome: input.outcome,
      ipHash: input.ipHash ?? null,
      installationThumbprint: input.installationThumbprint ?? null,
      licenseId: input.licenseId ?? null,
      createdAt: input.at,
    };
    this.s.attempts.push(attempt);
    return { ...attempt };
  }
  async countFailedCodeAttempts(input: {
    ipHash?: string | null;
    installationThumbprint?: string | null;
    since: Date;
  }) {
    const failed = this.s.attempts.filter(
      (a) =>
        a.kind === "ACTIVATE" &&
        a.outcome === "INVALID_CODE" &&
        a.createdAt.getTime() >= input.since.getTime(),
    );
    return {
      byIp: input.ipHash ? failed.filter((a) => a.ipHash === input.ipHash).length : 0,
      byInstallation: input.installationThumbprint
        ? failed.filter((a) => a.installationThumbprint === input.installationThumbprint).length
        : 0,
    };
  }
  async deleteOlderThan(cutoff: Date) {
    const before = this.s.attempts.length;
    this.s.attempts = this.s.attempts.filter((a) => a.createdAt.getTime() >= cutoff.getTime());
    return before - this.s.attempts.length;
  }
}

export class InMemorySpellNonces implements SpellNonceRepository {
  constructor(private s: SpellMemoryState) {}
  async tryConsume(input: { installationThumbprint: string; nonce: string; expiresAt: Date }) {
    const key = `${input.installationThumbprint}:${input.nonce}`;
    if (this.s.nonces.has(key)) return false;
    this.s.nonces.set(key, input.expiresAt);
    return true;
  }
  async deleteExpired(now: Date) {
    let n = 0;
    for (const [k, exp] of this.s.nonces) {
      if (exp.getTime() < now.getTime()) {
        this.s.nonces.delete(k);
        n++;
      }
    }
    return n;
  }
}

export class InMemorySpellUnitOfWork implements SpellUnitOfWork {
  private chain: Promise<unknown> = Promise.resolve();
  readonly repos: SpellRepositories;

  constructor(private readonly state: SpellMemoryState) {
    this.repos = {
      licenseRepository: new MemLicenses(state),
      installationRepository: new MemInstallations(state),
      activationRepository: new MemActivations(state),
      eventRepository: new MemEvents(state),
    };
  }

  runInTransaction<T>(work: (repos: SpellRepositories) => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const snapshot = this.state.snapshot();
      try {
        return await work(this.repos);
      } catch (error) {
        this.state.restore(snapshot);
        throw error;
      }
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export function createInMemorySpell() {
  const state = new SpellMemoryState();
  const unitOfWork = new InMemorySpellUnitOfWork(state);
  return {
    state,
    unitOfWork,
    ...unitOfWork.repos,
    attemptRepository: new InMemorySpellAttempts(state),
    nonceRepository: new InMemorySpellNonces(state),
  };
}
