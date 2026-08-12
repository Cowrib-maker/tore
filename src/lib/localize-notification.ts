import { NotificationType } from "@/domain/enums";
import type { Notification } from "@/domain/entities/trust";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

type MessageTemplates = MarketplaceDictionary["notifications"]["messages"];

function metaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function fillTemplate(
  template: string,
  params: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? "");
}

/**
 * Prefer type + structured metadata for locale-aware copy.
 * Falls back to stored title/body so historical English rows still render.
 */
export function localizeNotification(
  note: Pick<Notification, "type" | "title" | "body" | "metadata">,
  messages: MessageTemplates,
): { title: string; body: string } {
  const bookingNumber = metaString(note.metadata, "bookingNumber");
  const declineReason = metaString(note.metadata, "declineReason");
  const rejectionReason = metaString(note.metadata, "rejectionReason");

  switch (note.type) {
    case NotificationType.BOOKING_CREATED: {
      const t = messages.BOOKING_CREATED;
      if (!bookingNumber) return { title: note.title, body: note.body };
      return {
        title: t.title,
        body: fillTemplate(t.body, { bookingNumber }),
      };
    }
    case NotificationType.BOOKING_ACCEPTED: {
      const t = messages.BOOKING_ACCEPTED;
      if (!bookingNumber) return { title: note.title, body: note.body };
      return {
        title: t.title,
        body: fillTemplate(t.body, { bookingNumber }),
      };
    }
    case NotificationType.BOOKING_DECLINED: {
      const t = messages.BOOKING_DECLINED;
      if (!bookingNumber) return { title: note.title, body: note.body };
      const declineReasonSuffix = declineReason ? ` ${declineReason}` : "";
      return {
        title: t.title,
        body: fillTemplate(t.body, { bookingNumber, declineReasonSuffix }),
      };
    }
    case NotificationType.LAWYER_APPROVED: {
      const t = messages.LAWYER_APPROVED;
      return { title: t.title, body: t.body };
    }
    case NotificationType.LAWYER_REJECTED: {
      const t = messages.LAWYER_REJECTED;
      const rejectionReasonSuffix = rejectionReason
        ? ` ${rejectionReason}`
        : "";
      return {
        title: t.title,
        body: fillTemplate(t.body, { rejectionReasonSuffix }),
      };
    }
    default:
      return { title: note.title, body: note.body };
  }
}
