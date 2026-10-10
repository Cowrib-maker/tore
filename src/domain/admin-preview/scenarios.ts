import { UserRole } from "@/domain/enums";
import type { LegalAiAccessGate } from "@/components/legal-ai/interpret-legal-ai-chat-access";
import {
  getHomepageAccountHref,
  getHomepageProductHref,
} from "@/domain/services/homepage-routing";
import { isLocale, type Locale } from "@/i18n/config";

/**
 * Admin role preview: a read-only rendering of real TORE components against SYNTHETIC identities and states.
 *
 * What this is NOT: impersonation. No session is created or switched, no cookie is written, no database row is read for the
 * previewed "user", and nothing here can grant permissions. The scenarios below only decide which props the real components
 * receive. Server-side authorization is untouched — every real endpoint still evaluates the real (admin) session.
 * Entitlement-dependent states (subscription, lawyer access) are DECLARED scenarios, not computed from any real account.
 */
export const PREVIEW_CONTEXT_IDS = [
  "anonymous",
  "new-user",
  "citizen-free",
  "citizen-subscribed",
  "lawyer-no-entitlement",
  "lawyer-entitled",
] as const;
export type PreviewContextId = (typeof PREVIEW_CONTEXT_IDS)[number];

export const PREVIEW_PAGE_IDS = ["home", "student", "legal-ai-gate"] as const;
export type PreviewPageId = (typeof PREVIEW_PAGE_IDS)[number];

export type PreviewContext = {
  id: PreviewContextId;
  label: { mn: string; en: string };
  description: string;
  /** null = signed-out visitor. */
  role: UserRole.CLIENT | UserRole.LAWYER | null;
  subscription: "none" | "active" | "not-applicable";
  syntheticName: string | null;
};

export const PREVIEW_CONTEXTS: Record<PreviewContextId, PreviewContext> = {
  anonymous: {
    id: "anonymous",
    label: { mn: "Нэвтрээгүй зочин", en: "Anonymous visitor" },
    description: "Бүртгэлгүй, нэвтрээгүй хэрэглэгч.",
    role: null,
    subscription: "not-applicable",
    syntheticName: null,
  },
  "new-user": {
    id: "new-user",
    label: { mn: "Шинэ бүртгүүлсэн хэрэглэгч", en: "Newly registered user" },
    description: "Иргэний эрхээр дөнгөж бүртгүүлсэн, багцгүй, үнэгүй асуулт ашиглаагүй.",
    role: UserRole.CLIENT,
    subscription: "none",
    syntheticName: "Шинэ хэрэглэгч (жишээ)",
  },
  "citizen-free": {
    id: "citizen-free",
    label: { mn: "Иргэн — багцгүй", en: "Citizen — no subscription" },
    description: "Иргэн, идэвхтэй багцгүй (үнэгүй асуултаа ашигласан).",
    role: UserRole.CLIENT,
    subscription: "none",
    syntheticName: "Иргэн (жишээ)",
  },
  "citizen-subscribed": {
    id: "citizen-subscribed",
    label: { mn: "Иргэн — идэвхтэй багцтай", en: "Citizen — active subscription" },
    description: "Иргэн, идэвхтэй багцтай.",
    role: UserRole.CLIENT,
    subscription: "active",
    syntheticName: "Иргэн, багцтай (жишээ)",
  },
  "lawyer-no-entitlement": {
    id: "lawyer-no-entitlement",
    label: { mn: "Хуульч — эрхгүй", en: "Lawyer — without entitlement" },
    description: "Хуульчийн бүртгэлтэй, TORE Lawyer эрх идэвхгүй.",
    role: UserRole.LAWYER,
    subscription: "none",
    syntheticName: "Хуульч (жишээ)",
  },
  "lawyer-entitled": {
    id: "lawyer-entitled",
    label: { mn: "Хуульч — эрхтэй", en: "Lawyer — with entitlement" },
    description: "Хуульчийн бүртгэлтэй, TORE Lawyer эрх идэвхтэй.",
    role: UserRole.LAWYER,
    subscription: "active",
    syntheticName: "Хуульч, эрхтэй (жишээ)",
  },
};

/** Roles the task asked about that do NOT exist in this codebase's role model, with the reason shown to the admin. */
export const UNSUPPORTED_PREVIEW_CONTEXTS: ReadonlyArray<{ id: string; label: string; reason: string }> = [
  {
    id: "student",
    label: "Оюутан / Student",
    reason: "Системд «оюутан» гэсэн хэрэглэгчийн эрх (UserRole) байхгүй — зөвхөн CLIENT, LAWYER, ADMIN. /student нь нийтийн «удахгүй» хуудас.",
  },
  {
    id: "organization-member",
    label: "Байгууллага / баг гишүүн",
    reason: "Байгууллагын гишүүнчлэл нь өгөгдлийн сангийн гишүүнчлэлээр тодорхойлогддог бөгөөд урьдчилан харахад жинхэнэ гишүүнчлэл шаардана — синтетик болгож чадахгүй.",
  },
];

export const PREVIEW_PAGES: Record<PreviewPageId, { title: { mn: string; en: string }; description: string }> = {
  home: {
    title: { mn: "Нүүр хуудас", en: "Public homepage" },
    description: "Жинхэнэ LandingPage компонент: нэвтэрсэн төлөв, товчлуурын чиглэл, багцын CTA хэрэглэгчийн эрхээс хамаарна.",
  },
  student: {
    title: { mn: "Оюутны хуудас", en: "Student hub" },
    description: "Жинхэнэ StudentHubView: нийтийн цэс, хөл хэсэг болон оюутны танилцуулга. Нэвтэрсэн төлөв нь зөвхөн цэсийн товчлуурыг өөрчилнө.",
  },
  "legal-ai-gate": {
    title: { mn: "Хууль зүйн AI — хандалтын хаалт", en: "Legal AI access gate" },
    description: "Жинхэнэ LegalAiAccessGateCard: нэвтрэх эсвэл төлбөртэй багц шаардах үед хэрэглэгчид харагдах карт.",
  },
};

export type PreviewContentMode = "published" | "draft";

export type ResolvedPreview =
  | {
      ok: true;
      page: PreviewPageId;
      context: PreviewContext;
      locale: Locale;
      content: PreviewContentMode;
    }
  | { ok: false; reason: string };

export type RawPreviewParams = { page?: string; context?: string; locale?: string; content?: string };

/** Validates untrusted URL parameters against the allowlists. Anything unknown yields an explicit "unsupported" reason. */
export function resolvePreview(raw: RawPreviewParams): ResolvedPreview {
  const page = (PREVIEW_PAGE_IDS as readonly string[]).includes(raw.page ?? "") ? (raw.page as PreviewPageId) : null;
  if (!page) return { ok: false, reason: `Дэмжигдээгүй хуудас: «${(raw.page ?? "").slice(0, 40)}».` };

  const contextId = raw.context ?? "anonymous";
  if (!(PREVIEW_CONTEXT_IDS as readonly string[]).includes(contextId)) {
    const unsupported = UNSUPPORTED_PREVIEW_CONTEXTS.find((c) => c.id === contextId);
    return { ok: false, reason: unsupported ? unsupported.reason : `Дэмжигдээгүй төлөв: «${contextId.slice(0, 40)}».` };
  }

  const locale = raw.locale ?? "mn";
  if (!isLocale(locale)) return { ok: false, reason: `Дэмжигдээгүй хэл: «${locale.slice(0, 10)}».` };

  const content: PreviewContentMode = raw.content === "draft" ? "draft" : "published";
  return { ok: true, page, context: PREVIEW_CONTEXTS[contextId as PreviewContextId], locale, content };
}

/** Props for the real LandingPage. Mirrors src/app/page.tsx, but from the synthetic context instead of a session. */
export function getHomePreviewProps(context: PreviewContext, brandName: string) {
  const role = context.role ?? undefined;
  return {
    authUser: context.role
      ? { displayName: context.syntheticName ?? brandName, dashboardHref: getHomepageAccountHref(role) }
      : null,
    checkoutEnabled: context.role === UserRole.CLIENT,
    productHrefs: {
      citizen: getHomepageProductHref("citizen", role),
      student: getHomepageProductHref("student", role),
      lawyer: getHomepageProductHref("lawyer", role),
      firm: getHomepageProductHref("firm", role),
      team: getHomepageProductHref("team", role),
    },
  };
}

/**
 * The gate card a user in this context would be shown, or null when the declared state has full access (nothing is gated).
 * These are fixed demonstration states — the real gate decision lives in the Legal AI chat endpoint and is not re-implemented here.
 */
export function getGatePreview(context: PreviewContext): LegalAiAccessGate | null {
  const question = "Жишээ асуулт: Түрээсийн гэрээгээ цуцлах боломжтой юу?";
  if (context.role === null) {
    return { kind: "auth", question, message: "Үнэгүй асуултынхаа хариуг авсан тул нэвтэрнэ үү." };
  }
  if (context.subscription === "active") return null;
  return {
    kind: "billing",
    question,
    message: "Шинэ хууль зүйн асуултад төлбөртэй багц хэрэгтэй.",
    audience: context.role === UserRole.LAWYER ? "lawyer" : "citizen",
  };
}
