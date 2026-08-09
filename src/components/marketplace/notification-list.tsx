"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/actions/auth.actions";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/application/actions/notification.actions";
import { Button } from "@/components/ui/button";
import type { Notification } from "@/domain/entities/trust";
import type { Locale } from "@/i18n/config";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";
import {
  formatDateTimeUtc,
  formatNotificationType,
} from "@/lib/format-labels";

const initialState: ActionState = {};

type NotificationsCopy = MarketplaceDictionary["notifications"] &
  Pick<MarketplaceDictionary["common"], "saving" | "updating" | "utc">;

export function MarkAllNotificationsReadButton({
  copy,
}: {
  copy: Pick<NotificationsCopy, "markAllRead" | "updating">;
}) {
  const [state, formAction, pending] = useActionState(
    markAllNotificationsReadAction,
    initialState,
  );

  return (
    <form action={formAction}>
      {state.error && (
        <p
          id="mark-all-notifications-error"
          role="alert"
          aria-live="assertive"
          className="mb-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? copy.updating : copy.markAllRead}
      </Button>
    </form>
  );
}

export function NotificationList({
  notifications,
  copy,
  locale,
}: {
  notifications: Notification[];
  copy: NotificationsCopy;
  locale: Locale;
}) {
  if (notifications.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-10 text-center">
        <p className="text-sm font-medium">{copy.emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.emptyBody}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {notifications.map((note) => (
        <li
          key={note.id}
          className={
            note.readAt
              ? "rounded-xl border px-4 py-3 opacity-70"
              : "rounded-xl border border-[#0F3D33]/25 bg-[#F4F8F6] px-4 py-3"
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{note.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{note.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {formatDateTimeUtc(note.createdAt, locale)} {copy.utc}
                {" · "}
                {formatNotificationType(note.type, locale)}
              </p>
            </div>
            {!note.readAt && (
              <MarkOneReadButton id={note.id} copy={copy} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function MarkOneReadButton({
  id,
  copy,
}: {
  id: string;
  copy: Pick<NotificationsCopy, "markRead" | "saving">;
}) {
  const [state, formAction, pending] = useActionState(
    markNotificationReadAction,
    initialState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="notificationId" value={id} />
      {state.error && (
        <p
          id={`mark-notification-read-error-${id}`}
          role="alert"
          aria-live="assertive"
          className="text-xs text-destructive"
        >
          {state.error}
        </p>
      )}
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? copy.saving : copy.markRead}
      </Button>
    </form>
  );
}
