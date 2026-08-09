import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export async function getShellI18n(role: "client" | "lawyer" | "admin") {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);
  const d = dict.dashboard;
  const m = dict.marketplace;

  const nav =
    role === "client"
      ? [
          { href: "/client/dashboard", label: d.navDashboard },
          { href: "/client/profile", label: d.navProfile },
          { href: "/client/bookings", label: d.navBookings },
          { href: "/client/notifications", label: d.navNotifications },
          { href: "/lawyers", label: d.navFindLawyers },
        ]
      : role === "lawyer"
        ? [
            { href: "/lawyer/dashboard", label: d.navDashboard },
            { href: "/lawyer/profile", label: d.navProfile },
            { href: "/lawyer/verification", label: d.navVerification },
            { href: "/lawyer/offerings", label: d.navOfferings },
            { href: "/lawyer/availability", label: d.navAvailability },
            { href: "/lawyer/bookings", label: d.navBookings },
            { href: "/lawyer/notifications", label: d.navNotifications },
          ]
        : role === "admin"
          ? [
              { href: "/admin/dashboard", label: d.navDashboard },
              { href: "/admin/lawyers", label: d.navLawyerReview },
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
}
