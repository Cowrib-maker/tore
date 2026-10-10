import type { Metadata } from "next";

import { localeMeta, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";

/** Default <title>, description and social-share metadata for every page that does not set its own. Pure, so it is unit-testable. */
export function buildRootMetadata({
  dict,
  locale,
  base,
  appName,
}: {
  dict: Pick<Dictionary, "meta">;
  locale: Locale;
  base: string;
  appName: string;
}): Metadata {
  return {
    metadataBase: new URL(base),
    title: {
      default: dict.meta.title,
      template: `%s | ${appName}`,
    },
    description: dict.meta.description,
    applicationName: appName,
    openGraph: {
      type: "website",
      locale: localeMeta[locale].htmlLang.replace("-", "_"),
      url: base,
      siteName: appName,
      title: dict.meta.title,
      description: dict.meta.description,
    },
    twitter: {
      card: "summary_large_image",
      title: dict.meta.title,
      description: dict.meta.description,
    },
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    },
  };
}
