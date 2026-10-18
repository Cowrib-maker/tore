"use client";

import { ERROR_COPY } from "@/components/errors/error-copy";
import { goToSiteRoot } from "@/components/errors/go-to-site-root";

/**
 * Last-resort boundary: it replaces the ROOT layout, so it must render its own <html>/<body> and cannot rely on the app's
 * stylesheet, fonts, theme or dictionary (none of them are loaded here). Mongolian first, English underneath, plain inline
 * styles that follow the OS light/dark preference. Like app/error.tsx it never shows `error.message`, and it recovers with
 * `retry` (or `reset` if `retry` is missing). "Home" is a full page load: after a root-layout failure the router itself may
 * be unusable.
 */
export default function GlobalError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  const mn = ERROR_COPY.mn;
  const en = ERROR_COPY.en;
  const recover = retry ?? reset;
  return (
    <html lang="mn">
      <head>
        <meta name="color-scheme" content="light dark" />
        <title>{mn.title}</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "Canvas",
          color: "CanvasText",
        }}
      >
        <main style={{ maxWidth: 480, padding: "48px 20px", textAlign: "center" }}>
          <div role="alert">
            <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>{mn.title}</h1>
            <p style={{ margin: "0 0 8px", lineHeight: 1.6 }}>{mn.body}</p>
            <p lang="en" style={{ margin: "0 0 8px", lineHeight: 1.6, opacity: 0.75 }}>
              {en.body}
            </p>
            {error.digest ? (
              <p style={{ fontSize: 14, opacity: 0.75 }}>
                {mn.reference} / {en.reference}: <code>{error.digest}</code>
              </p>
            ) : null}
          </div>
          <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => recover?.()}
              style={{ padding: "10px 18px", fontSize: 16, borderRadius: 8, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer" }}
            >
              {mn.retry} / {en.retry}
            </button>
            <button
              type="button"
              onClick={() => goToSiteRoot()}
              style={{ padding: "10px 18px", fontSize: 16, border: "none", background: "transparent", color: "inherit", cursor: "pointer", textDecoration: "underline" }}
            >
              {mn.home} / {en.home}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
