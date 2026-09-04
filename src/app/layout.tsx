import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { LocalePersistence } from "@/components/i18n/locale-persistence";
import { ImpersonationBannerHost } from "@/components/admin/impersonation-banner-host";
import { FloatingLegalAiWidget } from "@/components/legal-ai/floating-legal-ai-widget";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getDictionary } from "@/i18n/get-dictionary";
import { getHtmlLang, getLocale } from "@/i18n/get-locale";
import { localeMeta } from "@/i18n/config";
import { env } from "@/lib/env";

import "./globals.css";

// The app uses request/session/database-backed server components.
// Prevent Next.js from executing those pages during static build-time data collection.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const appName = env.NEXT_PUBLIC_APP_NAME || "TORE";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [htmlLang, locale] = await Promise.all([getHtmlLang(), getLocale()]);

  return (
    <html
      lang={htmlLang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <LocalePersistence locale={locale} />
          <ImpersonationBannerHost />
          {children}
          <FloatingLegalAiWidget />
          <Toaster richColors closeButton />
        </TooltipProvider>
      </body>
    </html>
  );
}
