"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Thin wrapper around next-themes so the rest of the app imports from
 * "@/components/theme/theme-provider" instead of the library directly —
 * matches the existing pattern for other app-wide providers (e.g.
 * TooltipProvider in layout.tsx). next-themes handles class toggling
 * (`.dark` on <html>, matching the `@custom-variant dark` selector already
 * defined in globals.css), localStorage persistence, system-preference
 * matching, and the no-flash inline script — no new persistence mechanism
 * needed here.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
