import { cache } from "react";

import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";
import { isFoundationOrgsV1Enabled } from "@/lib/feature-flags";

export const getShellI18n = cache(async (role: "client" | "lawyer" | "admin") => {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);
  const d = dict.dashboard;
  const m = dict.marketplace;
  const orgsEnabled = isFoundationOrgsV1Enabled();
  const orgNav = orgsEnabled
    ? [{ href: "/organizations", label: d.navOrganizations }]
    : [];

  const nav =
    role === "client"
      ? [
          { href: "/client/dashboard", label: d.navDashboard },
          { href: "/legal-ai", label: d.navLegalAi },
          { href: "/client/profile", label: d.navProfile },
          { href: "/client/bookings", label: d.navBookings },
          { href: "/client/notifications", label: d.navNotifications },
          { href: "/lawyers", label: d.navFindLawyers },
          ...orgNav,
        ]
      : role === "lawyer"
        ? [
            { href: "/lawyer/dashboard", label: d.navDashboard },
            { href: "/lawyer/workspace", label: d.navWorkspace },
            { href: "/lawyer/offerings", label: d.navOfferings },
            { href: "/lawyer/bookings", label: d.navBookings },
            { href: "/lawyer/notifications", label: d.navNotifications },
            { href: "/legal-ai", label: d.navLegalChat },
            ...orgNav,
          ]
        : role === "admin"
          ? [
              { href: "/admin/dashboard", label: d.navDashboard },
              { href: "/admin/lawyers", label: d.navLawyerReview },
              ...(process.env.NODE_ENV !== "production"
                ? [{ href: "/admin/dev", label: d.navAdminDev }]
                : []),
              ...orgNav,
            ]
          : undefined;

  const title =
    role === "client"
      ? d.clientTitle
      : role === "lawyer"
        ? d.lawyerTitle
        : d.adminTitle;

  return {
    dict,
    locale,
    nav,
    title,
    profileTitle: d.profileTitle,
    pages: {
      offerings: d.pageOfferings,
      availability: d.pageAvailability,
      bookings: d.pageBookings,
      notifications: d.pageNotifications,
      verification: d.pageVerification,
    },
    shellProps: {
      locale,
      languageLabel: dict.common.language,
      signOutLabel: d.signOut,
      brand: dict.common.brand,
      navAriaLabel: m.common.mainNav,
      mobileNavLabel: m.common.navigate,
    },
  };
});
