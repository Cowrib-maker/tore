import type { ActorContext } from "@/application/common/actor-context";
import { canActAsLawyer } from "@/domain/services/rbac";
import { ForbiddenError } from "@/domain/errors/domain-error";

import { CaseFileAnalysisStatus } from "@/domain/entities/case-file";
import { BookingStatus } from "@/domain/enums";
import type { BookingRepository } from "@/domain/repositories/booking-repository";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import { calendarDayWindowInTimeZone } from "@/domain/services/timezone";
import { formatTodayLabelMn } from "@/lib/format-labels";

import { deriveCaseActivity } from "./case-activity";
import {
  type CaseAiDeps,
  type CaseConversationSummary,
} from "./case-conversations";
import { analysisStatusLabelMn, legalDomainLabelMn } from "./labels";
import { displayCaseStatus } from "./payload";

export type LawyerWorkspaceCaseCard = {
  caseId: string;
  title: string;
  domain: string;
  domainLabel: string;
  /** Canonical analysis-progress state (CaseFileAnalysisStatus) — the real
   * domain field, never the engine's disposition string. Filters must key
   * off this, not `status`. */
  analysisStatus: string;
  /** Display-oriented status: the engine disposition (e.g. SUPPORTED) for
   * analyzed cases, or the raw analysisStatus otherwise. For the status
   * pill's label/color, not for "has this case been analyzed" filtering. */
  status: string;
  statusLabel: string;
  conversationCount: number;
  documentCount: number;
  lastActivityAt: string;
  lastActivityLabel: string;
};

/** A real activity event, structured — never a pre-joined display string —
 * so the UI can render the event and its case separately without parsing. */
export type LawyerWorkspaceActivityItem = {
  id: string;
  at: string;
  title: string;
  caseTitle: string | null;
};

export type LawyerWorkspaceRecentConversation = {
  id: string;
  title: string;
  caseTitle: string | null;
  updatedAt: string;
};

export type LawyerWorkspaceSummary = {
  caseCount: number;
  analyzedCaseCount: number;
  notAnalyzedCaseCount: number;
  conversationCount: number;
  conversationsLast7Days: number;
  documentCount: number;
};

export type LawyerWorkspaceUpcomingBooking = {
  id: string;
  issueSummary: string;
  status: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
};

/**
 * Sourced entirely from BookingRepository (real consultation requests /
 * confirmed appointments) — never fabricated. Zeroed out (not an error)
 * when scheduleDeps is omitted or the actor has no lawyer profile yet, so
 * this stays additive and safe for every existing caller.
 */
export type LawyerWorkspaceSchedule = {
  pendingBookingCount: number;
  todaysConfirmedCount: number;
  upcoming: LawyerWorkspaceUpcomingBooking[];
  /** The single canonical "today" label for the workspace — the lawyer's
   * own calendar day (LawyerProfile.timezone), formatted once here so every
   * consumer (e.g. the right rail) renders the same value instead of each
   * computing its own, possibly server-timezone-based, date. */
  todayLabel: string;
};

export type LawyerWorkspaceHomeView = {
  cases: LawyerWorkspaceCaseCard[];
  recentConversations: LawyerWorkspaceRecentConversation[];
  activity: LawyerWorkspaceActivityItem[];
  summary: LawyerWorkspaceSummary;
  schedule: LawyerWorkspaceSchedule;
  /** Server clock (epoch ms) when this view was built. Relative times render from this, never from the client's clock, so SSR and hydration agree. */
  generatedAtMs: number;
};

export type LawyerWorkspaceScheduleDeps = {
  bookingRepository: BookingRepository;
  lawyerProfileRepository: LawyerProfileRepository;
};

const RECENT_CONVERSATION_LIMIT = 8;
const ACTIVITY_LIMIT = 10;
const CONVERSATION_FETCH = 50;
const UPCOMING_BOOKING_LIMIT = 4;
const EMPTY_SCHEDULE_COUNTS = {
  pendingBookingCount: 0,
  todaysConfirmedCount: 0,
  upcoming: [] as LawyerWorkspaceUpcomingBooking[],
};

async function loadSchedule(
  actor: ActorContext,
  scheduleDeps: LawyerWorkspaceScheduleDeps | undefined,
): Promise<LawyerWorkspaceSchedule> {
  const now = new Date();
  const lawyerProfile = scheduleDeps
    ? await scheduleDeps.lawyerProfileRepository.findByUserId(actor.userId)
    : null;

  // "Today" is the lawyer's own calendar day, not the server process's —
  // real IANA timezone math (DST-safe), not a fixed UTC offset. Falls back
  // to UTC only when there is no lawyer profile to read a timezone from,
  // matching calendarDayWindowInTimeZone's own fallback below.
  const timeZone = lawyerProfile?.timezone ?? "UTC";
  const todayLabel = formatTodayLabelMn(now, timeZone);

  if (!scheduleDeps || !lawyerProfile) {
    return { ...EMPTY_SCHEDULE_COUNTS, todayLabel };
  }

  const { start: todayStart, end: tomorrowStart } = calendarDayWindowInTimeZone(
    now,
    timeZone,
  );

  // Each query is scoped to exactly what it needs — a same-day count, an
  // unscoped status count, and the nearest N rows ascending — rather than
  // paginating an arbitrary take:N page (newest-first) and hoping the rows
  // that matter happened to land in it.
  const [pendingBookingCount, todaysConfirmedCount, upcomingBookings] =
    await Promise.all([
      scheduleDeps.bookingRepository.countByLawyerProfileIdAndStatus(
        lawyerProfile.id,
        BookingStatus.PENDING_ACCEPTANCE,
      ),
      scheduleDeps.bookingRepository.countByLawyerProfileIdAndStatus(
        lawyerProfile.id,
        BookingStatus.CONFIRMED,
        { from: todayStart, to: tomorrowStart },
      ),
      scheduleDeps.bookingRepository.findUpcomingForLawyer(
        lawyerProfile.id,
        BookingStatus.CONFIRMED,
        now,
        UPCOMING_BOOKING_LIMIT,
      ),
    ]);

  return {
    pendingBookingCount,
    todaysConfirmedCount,
    upcoming: upcomingBookings.map((booking) => ({
      id: booking.id,
      issueSummary: booking.issueSummary,
      status: booking.status,
      scheduledStartAt: booking.scheduledStartAt.toISOString(),
      scheduledEndAt: booking.scheduledEndAt.toISOString(),
    })),
    todayLabel,
  };
}

export async function loadLawyerWorkspaceHome(
  actor: ActorContext,
  deps: CaseAiDeps,
  scheduleDeps?: LawyerWorkspaceScheduleDeps,
): Promise<LawyerWorkspaceHomeView> {
  if (!canActAsLawyer(actor.role)) {
    throw new ForbiddenError("Зөвхөн өмгөөлөгч энэ ажлын орчныг нээж болно.");
  }

  const files = await deps.repository.listByOwnerLawyerId(actor.userId);
  const [conversations, caseConversationRows, schedule] = await Promise.all([
    deps.store.listOwnedRecentConversations(actor.userId, CONVERSATION_FETCH),
    Promise.all(
      files.map((file) =>
        deps.store.listOwnedCaseConversations(actor.userId, file.id),
      ),
    ),
    loadSchedule(actor, scheduleDeps),
  ]);

  const caseTitleById = new Map(files.map((file) => [file.id, file.title]));
  const conversationsByCase = new Map<string, CaseConversationSummary[]>();
  files.forEach((file, index) => {
    conversationsByCase.set(
      file.id,
      (caseConversationRows[index] ?? []).map((row) => ({
        id: row.id,
        title: row.title?.trim() || "Шинэ яриа",
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    );
  });

  const cases: LawyerWorkspaceCaseCard[] = files.map((file) => {
    const caseConversations = conversationsByCase.get(file.id) ?? [];
    const activity = deriveCaseActivity(file, caseConversations);
    const latest = activity[0];
    const status = displayCaseStatus(file);
    return {
      caseId: file.id,
      title: file.title,
      domain: file.legalDomain,
      domainLabel: legalDomainLabelMn(file.legalDomain),
      analysisStatus: file.analysisStatus,
      status,
      statusLabel: analysisStatusLabelMn(status),
      conversationCount: caseConversations.length,
      documentCount: file.evidence.filter((item) => item.fileReference).length,
      lastActivityAt: latest?.at ?? file.updatedAt.toISOString(),
      lastActivityLabel: latest?.label ?? "Хэрэг үүсгэсэн",
    };
  });

  const recentConversations = conversations
    .slice(0, RECENT_CONVERSATION_LIMIT)
    .map((row) => ({
      id: row.id,
      title: row.title?.trim() || "Шинэ яриа",
      caseTitle: row.caseFileId
        ? (caseTitleById.get(row.caseFileId) ?? null)
        : null,
      updatedAt: row.updatedAt.toISOString(),
    }));

  const activity: LawyerWorkspaceActivityItem[] = files
    .flatMap((file) =>
      deriveCaseActivity(file, conversationsByCase.get(file.id) ?? []).map(
        (item): LawyerWorkspaceActivityItem => ({
          id: `${file.id}:${item.id}`,
          at: item.at,
          title: item.label,
          caseTitle: file.title,
        }),
      ),
    )
    .concat(
      conversations
        .filter((row) => !row.caseFileId)
        .map(
          (row): LawyerWorkspaceActivityItem => ({
            id: `ai-started:${row.id}`,
            at: row.createdAt.toISOString(),
            title: "AI яриа эхлүүлсэн",
            caseTitle: null,
          }),
        ),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, ACTIVITY_LIMIT);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const caseLinkedCount = caseConversationRows.reduce(
    (total, rows) => total + rows.length,
    0,
  );
  const unattachedCount = conversations.filter((row) => !row.caseFileId).length;
  const summary: LawyerWorkspaceSummary = {
    caseCount: files.length,
    analyzedCaseCount: files.filter(
      (file) => file.analysisStatus === CaseFileAnalysisStatus.ANALYZED,
    ).length,
    notAnalyzedCaseCount: files.filter(
      (file) => file.analysisStatus === CaseFileAnalysisStatus.NOT_ANALYZED,
    ).length,
    conversationCount: caseLinkedCount + unattachedCount,
    conversationsLast7Days: conversations.filter(
      (row) => row.updatedAt.getTime() >= weekAgo,
    ).length,
    documentCount: cases.reduce((total, item) => total + item.documentCount, 0),
  };

  return { cases, recentConversations, activity, summary, schedule, generatedAtMs: Date.now() };
}
