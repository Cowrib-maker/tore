"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { buttonVariants } from "@/components/ui/button";
import { errorCopyFor } from "@/components/errors/error-copy";
import { cn } from "@/lib/utils";

const subscribeNever = () => () => undefined;
// The document language is only known in the browser; the server render (and first client render) uses Mongolian.
const readDocumentLang = () => document.documentElement.lang;
const serverDocumentLang = () => "mn";

/**
 * Fallback UI for any uncaught error in a route segment below the root layout (a server component that threw, a failed
 * data load, a render error). Replaces the framework's default error page with a clear message, a retry action
 * and a reference code (`digest`) that can be matched to the server log. It never shows `error.message`: for server
 * errors that is a generic string, for client errors it could contain internals.
 *
 * `retry` is the recovery prop documented for the installed Next.js (it re-fetches and re-renders the segment); `reset`
 * (clear the error state without re-fetching) is used only if `retry` is missing.
 */
export default function AppError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  const copy = errorCopyFor(useSyncExternalStore(subscribeNever, readDocumentLang, serverDocumentLang));
  const recover = retry ?? reset;

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-1 flex-col justify-center px-5 py-16 text-center sm:px-8">
      <div role="alert">
        <h1 className="ds-title">{copy.title}</h1>
        <p className="ds-subtitle mt-3">{copy.body}</p>
        {error.digest ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {copy.reference}: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => recover?.()} className={cn(buttonVariants())}>
          {copy.retry}
        </button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          {copy.home}
        </Link>
      </div>
    </main>
  );
}
