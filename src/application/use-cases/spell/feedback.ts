import type { ActorContext } from "@/application/common/actor-context";
import { UserRole } from "@/domain/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type { SpellFeedbackRepository } from "@/domain/repositories/spell-feedback-repository";
import { SpellActivationStatus, SpellEffectiveLicenseStatus } from "@/domain/spell/enums";
import { spellErrors } from "@/domain/spell/errors";
import {
  DECISION_STATUS,
  FeedbackValidationError,
  MAX_FEEDBACK_PER_USER_PER_DAY,
  REVIEWABLE_STATUSES,
  SPELL_FEEDBACK_DECISIONS,
  contributionStats,
  feedbackGroupKey,
  groupFeedback,
  normalizeFeedback,
  type ContributionStats,
  type FeedbackGroup,
  type FeedbackInput,
  type SpellFeedbackDecision,
  type SpellFeedbackStatus,
} from "@/domain/spell/feedback";
import { deriveLicenseState } from "@/domain/spell/license-state";
import type { AuthenticatedInstallation } from "./authenticate-installation-request";
import type { SpellDeps } from "./deps";

/**
 * User feedback use cases. Two hard rules, enforced here and by tests:
 *  1. A submitter can never choose or change a status (the input has no status; rows start PENDING; only an ADMIN reviews).
 *  2. Nothing here touches language data. Accepting feedback records a decision about a REPORT; changing the lexicon, a gold set or a data
 *     tier is a separate, reviewed, tested change made by people (and native review when the report needs it).
 */
export type FeedbackDeps = { feedbackRepository: SpellFeedbackRepository; spell: Pick<SpellDeps, "repos"> };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Only an installation that currently holds an ACTIVE activation of a live (not revoked, not expired) licence may report; the reporter identity
 * is the licence owner (or, for an unowned admin-issued licence, the licence itself — still one reporter per licence, never zero).
 */
async function reporterOf(device: AuthenticatedInstallation, activationId: string, deps: FeedbackDeps, now: Date): Promise<string> {
  const installation = device.installation;
  if (!installation) throw spellErrors.installationUnknown();
  const { activationRepository, licenseRepository } = deps.spell.repos;
  const activation = await activationRepository.findById(activationId);
  if (!activation || activation.installationId !== installation.id || activation.status !== SpellActivationStatus.ACTIVE) throw spellErrors.activationNotActive();
  const license = await licenseRepository.findById(activation.licenseId);
  if (!license || !license.startsAt || !license.expiresAt) throw spellErrors.activationNotActive();
  const state = deriveLicenseState(license, now).status;
  if (state === SpellEffectiveLicenseStatus.REVOKED) throw spellErrors.licenseRevoked();
  if (state === SpellEffectiveLicenseStatus.EXPIRED) throw spellErrors.licenseExpired();
  return activation.userId ?? license.ownerUserId ?? `license:${license.id}`;
}

export type FeedbackReceipt = { id: string; status: SpellFeedbackStatus; stats: ContributionStats };

export async function submitFeedback(
  input: { device: AuthenticatedInstallation; activationId: string; feedback: FeedbackInput },
  deps: FeedbackDeps,
  now: Date = new Date(),
): Promise<FeedbackReceipt> {
  const userId = await reporterOf(input.device, input.activationId, deps, now);
  let clean;
  try {
    clean = normalizeFeedback(input.feedback);
  } catch (e) {
    if (e instanceof FeedbackValidationError) throw new ValidationError("Invalid feedback");
    throw e;
  }
  if ((await deps.feedbackRepository.countByUserSince(userId, new Date(now.getTime() - DAY_MS))) >= MAX_FEEDBACK_PER_USER_PER_DAY) {
    throw spellErrors.tooManyAttempts(3600);
  }
  const row = await deps.feedbackRepository.create({ ...clean, userId, groupKey: feedbackGroupKey(clean), createdAt: now });
  return { id: row.id, status: row.status, stats: contributionStats(await deps.feedbackRepository.listByUser(userId, 1000)) };
}

export async function getContributions(
  input: { device: AuthenticatedInstallation; activationId: string },
  deps: FeedbackDeps,
  now: Date = new Date(),
): Promise<ContributionStats> {
  const userId = await reporterOf(input.device, input.activationId, deps, now);
  return contributionStats(await deps.feedbackRepository.listByUser(userId, 1000));
}

// ── admin ───────────────────────────────────────────────────────────────────

function assertAdmin(actor: ActorContext): void {
  if (actor.role !== UserRole.ADMIN) throw new ForbiddenError();
}

/** Cap on rows read for grouping: V1 volume. Beyond it the oldest reports of the filter are not shown (documented, never silent in the response). */
export const FEEDBACK_ADMIN_ROW_CAP = 5000;

export type FeedbackGroupView = Omit<FeedbackGroup, "firstReportedAt" | "lastReportedAt"> & { firstReportedAt: string; lastReportedAt: string };

export async function listFeedbackGroups(
  actor: ActorContext,
  query: { status?: SpellFeedbackStatus; limit: number },
  deps: Pick<FeedbackDeps, "feedbackRepository">,
): Promise<{ groups: FeedbackGroupView[]; rowsRead: number; truncated: boolean }> {
  assertAdmin(actor);
  const rows = await deps.feedbackRepository.list({ status: query.status, limit: FEEDBACK_ADMIN_ROW_CAP });
  const groups = groupFeedback(rows).slice(0, query.limit).map((g) => ({ ...g, firstReportedAt: g.firstReportedAt.toISOString(), lastReportedAt: g.lastReportedAt.toISOString() }));
  return { groups, rowsRead: rows.length, truncated: rows.length >= FEEDBACK_ADMIN_ROW_CAP };
}

export async function reviewFeedbackGroup(
  actor: ActorContext,
  input: { groupKey: string; decision: string; reason: string },
  deps: Pick<FeedbackDeps, "feedbackRepository">,
  now: Date = new Date(),
): Promise<{ updated: number; status: SpellFeedbackStatus }> {
  assertAdmin(actor);
  if (!SPELL_FEEDBACK_DECISIONS.includes(input.decision as SpellFeedbackDecision)) throw new ValidationError("Unknown decision");
  const reason = input.reason?.trim();
  if (!reason || reason.length > 500) throw new ValidationError("A review reason is required");
  const rows = await deps.feedbackRepository.listByGroupKey(input.groupKey);
  if (rows.length === 0) throw new NotFoundError("Feedback group not found");
  if (!rows.some((r) => REVIEWABLE_STATUSES.includes(r.status))) throw new ValidationError("This group is already finally reviewed");
  const status = DECISION_STATUS[input.decision as SpellFeedbackDecision] as Exclude<SpellFeedbackStatus, "PENDING">;
  const updated = await deps.feedbackRepository.reviewGroup({ groupKey: input.groupKey, status, reviewedBy: actor.userId, reviewReason: reason, at: now });
  return { updated, status };
}
