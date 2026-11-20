import type { LawyerVerificationState } from "@/domain/services/lawyer-onboarding";
import type { BillingDisplayStatus } from "@/domain/services/billing-display-status";

/**
 * A lawyer has two INDEPENDENT things: a verified licence (admin review) and a
 * paid subscription. Neither implies the other. This only describes them side
 * by side and names the one next action; it grants nothing and changes no state.
 */
export type SubscriptionStage =
  | "INACTIVE"
  | "PAYMENT_PENDING"
  | "AWAITING_VERIFICATION"
  | "ACTIVE"
  | "EXPIRED";

export function deriveSubscriptionStage(input: {
  billingStatus: BillingDisplayStatus;
  /** Status of the open (not yet settled) invoice, if any. */
  pendingInvoiceStatus?: string | null;
}): SubscriptionStage {
  if (input.billingStatus === "ACTIVE") return "ACTIVE";
  if (input.pendingInvoiceStatus === "AWAITING_VERIFICATION") return "AWAITING_VERIFICATION";
  if (input.pendingInvoiceStatus === "PENDING" || input.billingStatus === "PENDING") return "PAYMENT_PENDING";
  if (input.billingStatus === "EXPIRED" || input.billingStatus === "PAST_DUE") return "EXPIRED";
  return "INACTIVE";
}

export const LICENSE_STAGE_LABEL_MN: Record<LawyerVerificationState, string> = {
  SUBMIT_LICENSE: "Эрхийн бичиг илгээгээгүй",
  UNDER_REVIEW: "Эрх шалгагдаж байна",
  APPROVED: "Эрх баталгаажсан",
  REJECTED: "Эрх татгалзагдсан",
  SUSPENDED: "Эрх түдгэлзсэн",
};

export const SUBSCRIPTION_STAGE_LABEL_MN: Record<SubscriptionStage, string> = {
  INACTIVE: "Өөрийн багц идэвхгүй",
  PAYMENT_PENDING: "Төлбөр хүлээгдэж байна",
  AWAITING_VERIFICATION: "Төлбөр шалгагдаж байна",
  ACTIVE: "Багц идэвхтэй",
  EXPIRED: "Өөрийн багцын хугацаа дууссан",
};

/**
 * Shown only for INACTIVE and EXPIRED. It says what this card IS (the lawyer's own purchased plan)
 * and where the authoritative answer lives (the Legal AI page, which resolves access on the server).
 * It deliberately does not mention team seats or any other source of access: no product flow
 * assigns a seat to another user today (seats are created only for the buyer's own subscription and
 * for platform demo accounts), so naming one would suggest a capability that does not exist.
 */
export const OTHER_LEGAL_AI_ACCESS_NOTE_MN =
  "Энэ нь зөвхөн таны өөрийн багцын төлөв. Legal AI-ийн хандалтын бодит төлөвийг Legal AI хуудас харуулна.";

export function showsOtherLegalAiAccessNote(stage: SubscriptionStage): boolean {
  return stage === "INACTIVE" || stage === "EXPIRED";
}

export type LawyerNextAction = {
  kind: "VERIFY_LICENSE" | "ACTIVATE_PLAN" | "CHECK_PAYMENT" | "RENEW_PLAN" | "NONE";
  label: string;
  /** Where the action leads: licence actions go to verification, plan actions to the billing page. */
  target: "verification" | "billing" | null;
};

/**
 * One next step. Subscription actions come first because they are what blocks
 * the AI assistant; the licence step is reported separately and never hidden by
 * a paid plan (a paid plan does not verify a licence, and vice versa).
 * `license` is null for accounts with no licence-verification flow (non-attorney
 * positions, or no profile yet): they only ever get subscription actions.
 */
export function nextLawyerAction(license: LawyerVerificationState | null, subscription: SubscriptionStage): LawyerNextAction {
  switch (subscription) {
    case "INACTIVE":
      return { kind: "ACTIVATE_PLAN", label: "Багц идэвхжүүлэх", target: "billing" };
    case "EXPIRED":
      return { kind: "RENEW_PLAN", label: "Багц сунгах", target: "billing" };
    case "PAYMENT_PENDING":
    case "AWAITING_VERIFICATION":
      return { kind: "CHECK_PAYMENT", label: "Төлбөрийн төлөв харах", target: "billing" };
    case "ACTIVE":
      break;
  }
  if (license === null) return { kind: "NONE", label: "", target: null };
  if (license === "SUBMIT_LICENSE") return { kind: "VERIFY_LICENSE", label: "Эрхийн бичгээ илгээх", target: "verification" };
  if (license === "REJECTED") return { kind: "VERIFY_LICENSE", label: "Эрхийн мэдээллээ засах", target: "verification" };
  return { kind: "NONE", label: "", target: null };
}
