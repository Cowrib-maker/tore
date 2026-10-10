"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import {
  discardSiteContentDraftAction,
  publishSiteContentAction,
  restoreSiteContentRevisionAction,
  saveSiteContentDraftAction,
  unpublishSiteContentAction,
  type SiteContentActionResult,
} from "@/application/actions/admin-site-content.actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { validateSiteContentValue, type SiteContentDefinition } from "@/domain/site-content/registry";

export type EditorPlacement = {
  pageTitle: string;
  route: string;
  sectionTitle: string;
  /** Admin preview page for this key (e.g. "home", "spell"), or null when none exists. */
  previewPage: "home" | "spell" | null;
};

export type EditorLocaleData = {
  locale: "mn" | "en";
  defaultValue: string;
  publishedValue: string | null;
  editorValue: string;
  version: number;
  hasPendingDraft: boolean;
  publishedRevision: number | null;
  publishedAtLabel: string | null;
  publishedByLabel: string | null;
  updatedAtLabel: string | null;
  updatedByLabel: string | null;
  revisions: Array<{ revision: number; value: string; createdAtLabel: string; createdByLabel: string | null }>;
};

const LOCALE_TITLE = { mn: "Монгол (MN)", en: "English (EN)" } as const;

type PanelMessage = { kind: "ok" | "error" | "conflict"; text: string } | null;

/**
 * Rendered by key={locale-version} so a refreshed server state replaces the local text after every successful write or reload.
 * The status message lives in the parent: the panel remounts on refresh and would otherwise lose the confirmation.
 */
function LocalePanel({
  definition,
  data,
  placement,
  message,
  setMessage,
  onDirtyChange,
}: {
  definition: SiteContentDefinition;
  data: EditorLocaleData;
  placement: EditorPlacement;
  message: PanelMessage;
  setMessage: (message: PanelMessage) => void;
  onDirtyChange: (locale: string, dirty: boolean) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(data.editorValue);
  const [version, setVersion] = useState(data.version);
  const [pending, startTransition] = useTransition();

  const dirty = value !== data.editorValue;
  useEffect(() => {
    onDirtyChange(data.locale, dirty);
    return () => onDirtyChange(data.locale, false);
  }, [dirty, data.locale, onDirtyChange]);
  const check = validateSiteContentValue(definition, value);
  const liveText = data.publishedValue ?? data.defaultValue;

  function run(task: () => Promise<SiteContentActionResult>, success: string) {
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        setVersion(result.version);
        setMessage({ kind: "ok", text: success });
        router.refresh();
      } else {
        // A failed write must never look like a success: keep the user's text and show the reason.
        setMessage({ kind: result.code === "conflict" ? "conflict" : "error", text: result.message });
      }
    });
  }

  function saveDraft() {
    run(() => saveSiteContentDraftAction({ key: definition.key, locale: data.locale, value, expectedVersion: version }), "Ноорог хадгалагдлаа. Одоогоор олон нийтэд харагдахгүй.");
  }

  function publish() {
    startTransition(async () => {
      let current = version;
      if (dirty || !data.hasPendingDraft) {
        const saved = await saveSiteContentDraftAction({ key: definition.key, locale: data.locale, value, expectedVersion: current });
        if (!saved.ok) {
          setMessage({ kind: saved.code === "conflict" ? "conflict" : "error", text: saved.message });
          return;
        }
        current = saved.version;
        setVersion(current);
      }
      const published = await publishSiteContentAction({ key: definition.key, locale: data.locale, expectedVersion: current });
      if (published.ok) {
        setVersion(published.version);
        setMessage({ kind: "ok", text: `Нийтлэгдлээ (хувилбар ${published.publishedRevision}).` });
        router.refresh();
      } else {
        setMessage({ kind: published.code === "conflict" ? "conflict" : "error", text: `Нийтэлж чадсангүй: ${published.message}` });
      }
    });
  }

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label={LOCALE_TITLE[data.locale]}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{LOCALE_TITLE[data.locale]}</h2>
        <span className="flex gap-2">
          {data.hasPendingDraft ? <Badge variant="destructive">Ноорогтой</Badge> : null}
          <Badge variant={data.publishedValue !== null ? "default" : "outline"}>
            {data.publishedValue !== null ? `Нийтлэгдсэн · v${data.publishedRevision}` : "Анхдагч текст ашиглаж байна"}
          </Badge>
        </span>
      </header>

      <label className="block text-sm font-medium" htmlFor={`value-${data.locale}`}>
        Текст
      </label>
      <textarea
        id={`value-${data.locale}`}
        lang={data.locale}
        className="min-h-24 w-full rounded-md border bg-background p-2 text-sm"
        rows={definition.multiline ? 4 : 2}
        value={value}
        maxLength={definition.maxLength + 50}
        onChange={(event) => setValue(event.target.value)}
        aria-invalid={!check.ok}
        aria-describedby={`help-${data.locale}`}
      />
      <p id={`help-${data.locale}`} className={check.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"} role={check.ok ? undefined : "alert"}>
        {check.ok ? `${value.trim().length}/${definition.maxLength} тэмдэгт · зөвхөн энгийн текст` : check.reason}
      </p>

      {definition.role ? <MetaSnippet role={definition.role} text={check.ok ? check.value : liveText} /> : null}
      <div className="rounded-md bg-muted/50 p-3 text-sm" aria-label="Урьдчилан харах">
        <p className="mb-1 text-xs text-muted-foreground">Урьдчилсан харагдац (нийтлэхээс өмнө)</p>
        <p lang={data.locale} className={definition.multiline ? "" : "text-lg font-semibold"}>{check.ok ? check.value : liveText}</p>
      </div>
      <dl className="grid gap-1 text-xs text-muted-foreground" aria-label="Утгын харьцуулалт">
        <div className="flex gap-2"><dt className="w-28 shrink-0 font-medium">Анхдагч (код)</dt><dd lang={data.locale}>{data.defaultValue}</dd></div>
        <div className="flex gap-2"><dt className="w-28 shrink-0 font-medium">Нийтлэгдсэн</dt><dd lang={data.locale}>{data.publishedValue ?? "— байхгүй (анхдагч текст ашиглаж байна)"}</dd></div>
        <div className="flex gap-2"><dt className="w-28 shrink-0 font-medium">Ноорог</dt><dd lang={data.locale}>{data.hasPendingDraft ? data.editorValue : "— байхгүй"}</dd></div>
      </dl>
      {value.trim() !== data.defaultValue ? (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setValue(data.defaultValue)}>
          Анхдагч текстийг талбарт оруулах (хадгалахгүй)
        </Button>
      ) : null}
      {data.publishedAtLabel ? (
        <p className="text-xs text-muted-foreground">Сүүлд нийтэлсэн: {data.publishedAtLabel} · {data.publishedByLabel ?? "—"}</p>
      ) : null}
      {data.updatedAtLabel ? <p className="text-xs text-muted-foreground">Сүүлд өөрчилсөн: {data.updatedAtLabel} · {data.updatedByLabel ?? "—"}</p> : null}

      {message ? (
        <p role={message.kind === "ok" ? "status" : "alert"} className={message.kind === "ok" ? "text-sm text-emerald-700" : "text-sm text-destructive"}>
          {message.text}
          {message.kind === "conflict" ? (
            <>
              {" "}
              <Button type="button" size="sm" variant="outline" onClick={() => router.refresh()}>Шинэчлэх</Button>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending || !check.ok || !dirty} onClick={saveDraft}>
          Ноорог хадгалах
        </Button>
        <Button type="button" disabled={pending || !check.ok || (!dirty && !data.hasPendingDraft)} onClick={publish}>
          {dirty ? "Хадгалаад нийтлэх" : "Нийтлэх"}
        </Button>
        {placement.previewPage ? (
          <Link
            href={`/admin/preview/${placement.previewPage}?locale=${data.locale}&content=draft`}
            className={buttonVariants({ variant: "ghost" })}
            target="_blank"
          >
            «{placement.pageTitle}»-д урьдчилан харах (ноорогтой)
          </Link>
        ) : (
          <span className="self-center text-xs text-muted-foreground">Энэ хуудсанд урьдчилан харах боломжгүй</span>
        )}
        {data.hasPendingDraft ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => discardSiteContentDraftAction({ key: definition.key, locale: data.locale, expectedVersion: version }), "Ноорог устгагдлаа.")}
          >
            Ноорог устгах
          </Button>
        ) : null}
        {data.publishedValue !== null ? (
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Нийтлэгдсэн текстийг болиулж, кодонд байгаа анхдагч текст рүү буцаах уу?\n\nОдоо: «${data.publishedValue}»\nДараа нь: «${data.defaultValue}»\n\nХувилбарын түүх хадгалагдана; хүсвэл дахин сэргээж болно.`)) {
                run(() => unpublishSiteContentAction({ key: definition.key, locale: data.locale, expectedVersion: version }), "Анхдагч текст рүү буцлаа.");
              }
            }}
          >
            Нийтлэлийг болиулж анхдагч руу буцаах
          </Button>
        ) : null}
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-medium">Хувилбарын түүх ({data.revisions.length})</summary>
        {data.revisions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Одоогоор нийтэлсэн хувилбар алга.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {data.revisions.map((revision) => (
              <li key={revision.revision} className="rounded border p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    v{revision.revision}{revision.revision === data.publishedRevision ? " · одоогийн" : ""} · {revision.createdAtLabel} · {revision.createdByLabel ?? "—"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => restoreSiteContentRevisionAction({ key: definition.key, locale: data.locale, revision: revision.revision, expectedVersion: version }),
                        `v${revision.revision} ноорог болж сэргэлээ. Нийтэлж байж олон нийтэд гарна.`,
                      )
                    }
                  >
                    Ноорог болгон сэргээх
                  </Button>
                </div>
                <p lang={data.locale} className="mt-1">{revision.value}</p>
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}

function MetaSnippet({ role, text }: { role: "metaTitle" | "metaDescription"; text: string }) {
  return (
    <div className="rounded-md border p-3" aria-label="Хайлтын үр дүнгийн урьдчилсан харагдац">
      <p className="mb-1 text-xs text-muted-foreground">{role === "metaTitle" ? "Хөтчийн таб / хайлтын гарчиг" : "Хайлтын үр дүнгийн тайлбар"}</p>
      {role === "metaTitle" ? (
        <p className="truncate text-base text-blue-700">{text}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{text.length > 160 ? `${text.slice(0, 157)}…` : text}</p>
      )}
    </div>
  );
}

export function SiteContentEditor({
  definition,
  locales,
  placement,
}: {
  definition: SiteContentDefinition;
  locales: EditorLocaleData[];
  placement: EditorPlacement;
}) {
  const [messages, setMessages] = useState<Record<string, PanelMessage>>({});
  const [dirtyByLocale, setDirtyByLocale] = useState<Record<string, boolean>>({});
  const anyDirty = Object.values(dirtyByLocale).some(Boolean);
  const onDirtyChange = useCallback((locale: string, dirty: boolean) => {
    setDirtyByLocale((current) => (current[locale] === dirty ? current : { ...current, [locale]: dirty }));
  }, []);

  // Unsaved-edit guard: tab close / reload (browser prompt) and in-app link clicks (confirm).
  useEffect(() => {
    if (!anyDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.href.startsWith("javascript:")) return;
      if (!window.confirm("Хадгалаагүй өөрчлөлт байна. Гарвал алдагдана. Үргэлжлүүлэх үү?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [anyDirty]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Байршил: <strong>{placement.pageTitle}</strong> <code className="text-xs">{placement.route}</code> › {placement.sectionTitle}
      </p>
      {anyDirty ? (
        <p role="status" className="rounded-md bg-amber-50 p-2 text-sm text-amber-950" data-unsaved-warning>
          Хадгалаагүй өөрчлөлт байна — «Ноорог хадгалах» эсвэл «Нийтлэх» дарна уу.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {locales.map((data) => (
          <LocalePanel
            key={`${data.locale}-${data.version}`}
            definition={definition}
            data={data}
            placement={placement}
            message={messages[data.locale] ?? null}
            setMessage={(message) => setMessages((current) => ({ ...current, [data.locale]: message }))}
            onDirtyChange={onDirtyChange}
          />
        ))}
      </div>
    </div>
  );
}
