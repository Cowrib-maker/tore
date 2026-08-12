import { describe, expect, it } from "vitest";

import { NotificationType } from "@/domain/enums";
import { marketplaceEn } from "@/i18n/dictionaries/marketplace/en";
import { marketplaceMn } from "@/i18n/dictionaries/marketplace/mn";
import { localizeNotification } from "@/lib/localize-notification";

describe("localizeNotification", () => {
  it("renders Mongolian copy from type + structured metadata", () => {
    const result = localizeNotification(
      {
        type: NotificationType.BOOKING_CREATED,
        title: "New booking request",
        body: "Request BK-1 is awaiting your response.",
        metadata: { bookingId: "b1", bookingNumber: "BK-1" },
      },
      marketplaceMn.notifications.messages,
    );
    expect(result.title).toBe(
      marketplaceMn.notifications.messages.BOOKING_CREATED.title,
    );
    expect(result.body).toContain("BK-1");
    expect(result.body).not.toContain("awaiting your response");
  });

  it("falls back to stored English when structured params are missing", () => {
    const result = localizeNotification(
      {
        type: NotificationType.BOOKING_ACCEPTED,
        title: "Booking accepted",
        body: "Your request BK-legacy was accepted.",
        metadata: { bookingId: "legacy" },
      },
      marketplaceEn.notifications.messages,
    );
    expect(result.title).toBe("Booking accepted");
    expect(result.body).toBe("Your request BK-legacy was accepted.");
  });

  it("localizes lawyer rejection with rejectionReason", () => {
    const result = localizeNotification(
      {
        type: NotificationType.LAWYER_REJECTED,
        title: "License rejected",
        body: "Your lawyer credentials were rejected. Incomplete scan",
        metadata: { rejectionReason: "Incomplete scan" },
      },
      marketplaceMn.notifications.messages,
    );
    expect(result.title).toBe(
      marketplaceMn.notifications.messages.LAWYER_REJECTED.title,
    );
    expect(result.body).toContain("Incomplete scan");
  });
});
