"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ChevronDown,
  FileText,
  Menu,
  Mic,
  Paperclip,
  Plus,
  Scale,
  Send,
  Shield,
  Square,
  SquarePen,
  Users,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { ToreLogo } from "@/components/brand/tore-logo";
import { BrandLink } from "@/components/layout/brand-link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  LEGAL_AI_DOCUMENT_FILE_ACCEPT,
  LEGAL_AI_NEEDS_OCR_WARNING,
} from "@/application/ai/legal-ai-document.constants";
import {
  clientRejectLegalAiDocument,
  legalAiExtractStatusHint,
} from "@/application/ai/legal-ai-document-file";
import {
  parseSafeCitationsFromUnknown,
  type LegalAiSafeCitation,
} from "@/application/ai/legal-ai-citation";
import { LegalAiCitationList } from "@/components/legal-ai/legal-ai-citation-list";
import { LEGAL_AI_CHAT_RETRY_MESSAGE } from "@/components/legal-ai/legal-ai-chat-errors";
import { useThinkingStageLabel } from "@/components/legal-ai/legal-ai-thinking-stages";
import {
  interpretLegalAiChatAccess,
  type LegalAiAccessGate,
} from "@/components/legal-ai/interpret-legal-ai-chat-access";
import { LegalAiAccessGateCard } from "@/components/legal-ai/legal-ai-access-gate";
import { LegalAiDutyNotice } from "@/components/legal-ai/legal-ai-duty-notice";
import { LegalAiEntitlementBanner } from "@/components/legal-ai/legal-ai-entitlement-banner";
import {
  OrthographyCheckButton,
  OrthographyStatusBar,
  useOrthographyAutoCheck,
  useOrthographyCheck,
} from "@/components/orthography/orthography-checker";
import { SpellcheckTextarea } from "@/components/orthography/spellcheck-textarea";
import { parseSseStream } from "@/lib/parse-sse-stream";
import { isNearBottom } from "@/lib/scroll-position";
import {
  LEGAL_AI_PATH,
  loginHrefForLegalAi,
  registerClientHrefForLegalAi,
} from "@/domain/services/rbac";
import { cn } from "@/lib/utils";

type Message = {
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: LegalAiSafeCitation[];
};

type AttachedDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractStatus: "OK" | "EMPTY" | "FAILED" | "NEEDS_OCR";
  pageCount: number | null;
};

type LegalAiChatProps = {
  initialQuestion?: string;
  initialConversationId?: string;
  initialMessages?: Message[];
  initialAttachedDocuments?: AttachedDocument[];
  documentUploadEnabled?: boolean;
  dashboardHref: string | null;
  displayName?: string | null;
  signInLabel: string;
  getStartedLabel: string;
  dashboardLabel: string;
};

/** Below this distance (px) from the true bottom, the transcript counts as
 * "at bottom" for auto-follow purposes. */
const TRANSCRIPT_NEAR_BOTTOM_THRESHOLD_PX = 48;

const QUICK_ACTIONS = [
  {
    id: "fired",
    label: "Намайг ажлаас халсан.",
    icon: Scale,
    prompt: "Намайг ажлаас халсан.",
  },
  {
    id: "unpaid",
    label: "Мөнгө өгөхгүй байна.",
    icon: Shield,
    prompt: "Мөнгө өгөхгүй байна.",
  },
  {
    id: "accident",
    label: "Зам тээврийн осолд орсон.",
    icon: FileText,
    prompt: "Зам тээврийн осолд орсон.",
  },
  {
    id: "contract",
    label: "Гэрээтэй холбоотой асуудалтай.",
    icon: Users,
    prompt: "Гэрээтэй холбоотой асуудалтай.",
  },
  {
    id: "police",
    label: "Цагдаад дуудсан.",
    icon: Scale,
    prompt: "Цагдаад дуудсан.",
  },
] as const;

export function LegalAiChat({
  initialQuestion = "",
  initialConversationId,
  initialMessages = [],
  initialAttachedDocuments = [],
  documentUploadEnabled = false,
  dashboardHref,
  displayName,
  signInLabel,
  getStartedLabel,
  dashboardLabel,
}: LegalAiChatProps) {
  const [message, setMessage] = useState(initialQuestion);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationId,
  );
  const [loading, setLoading] = useState(false);
  const thinkingStageLabel = useThinkingStageLabel(loading);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [attachedDocuments, setAttachedDocuments] = useState<AttachedDocument[]>(
    initialAttachedDocuments,
  );
  const [listening, setListening] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accessGate, setAccessGate] = useState<LegalAiAccessGate | null>(null);
  const {
    loading: orthographyLoading,
    result: orthographyResult,
    gateMessage: orthographyGate,
    needsBilling: orthographyNeedsBilling,
    open: orthographyOpen,
    includeLatinToCyrillic,
    setIncludeLatinToCyrillic,
    check: checkOrthography,
    clear: clearOrthography,
  } = useOrthographyCheck();

  useOrthographyAutoCheck(message, checkOrthography, {
    enabled: !loading && !uploading,
    minLength: 10,
    clear: clearOrthography,
  });

  const documentInputRef = useRef<HTMLInputElement>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingUploadRef = useRef<File | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const conversationIdRef = useRef(conversationId);
  const abortRef = useRef<AbortController | null>(null);

  // Whether the transcript is scrolled near its bottom — drives whether new
  // content auto-follows (scrolls down with it) or, if the user has
  // scrolled up to read earlier messages, is left alone with a "new
  // response" affordance instead of yanking their scroll position.
  const isNearBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const prevMessageCountRef = useRef(messages.length);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const scrollTranscriptToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const nearBottom = isNearBottom(el, TRANSCRIPT_NEAR_BOTTOM_THRESHOLD_PX);
    if (nearBottom !== isNearBottomRef.current) {
      isNearBottomRef.current = nearBottom;
    }
    if (nearBottom) {
      setShowJumpToLatest(false);
    }
  }, []);

  useEffect(() => {
    const grew = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (isNearBottomRef.current) {
      transcriptRef.current?.scrollTo({
        top: transcriptRef.current.scrollHeight,
        behavior: "smooth",
      });
    } else if (grew) {
      // A new message landed while the user was reading further up —
      // surface it via the floating control instead of forcing their view.
      setShowJumpToLatest(true);
    }
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const resetConversation = useCallback(() => {
    recognitionRef.current?.stop();
    setMessages([]);
    setConversationId(undefined);
    setError("");
    setAccessGate(null);
    setAttachedDocuments([]);
    setMessage("");
    setListening(false);
    setMobileNavOpen(false);
    clearOrthography();
  }, [clearOrthography]);

  function openDocumentPicker() {
    if (!documentUploadEnabled) {
      toast.message("Файл хавсаргахын тулд нэвтэрнэ үү.");
      return;
    }
    if (uploading) {
      return;
    }
    documentInputRef.current?.click();
  }

  function removeAttachedDocument(documentId: string) {
    setAttachedDocuments((current) =>
      current.filter((document) => document.id !== documentId),
    );
  }

  function resumeAfterAccessGate() {
    if (pendingUploadRef.current) {
      const file = pendingUploadRef.current;
      pendingUploadRef.current = null;
      void uploadDocument(file);
      return;
    }
    if (accessGate?.question) {
      void sendMessage(accessGate.question, { resume: true });
    }
  }

  async function handleDocumentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    await uploadDocument(file);
  }

  async function uploadDocument(file: File) {
    if (!documentUploadEnabled) {
      setError("Файл хавсаргахын тулд нэвтэрнэ үү.");
      return;
    }
    const rejected = clientRejectLegalAiDocument(file);
    if (rejected) {
      setError(rejected);
      return;
    }

    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (conversationId) {
        formData.append("conversationId", conversationId);
      }

      const response = await fetch("/api/ai/documents", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        error?: string;
        id?: string;
        conversationId?: string;
        fileName?: string;
        mimeType?: string;
        sizeBytes?: number;
        extractStatus?: AttachedDocument["extractStatus"];
        pageCount?: number | null;
        storageKey?: string;
        key?: string;
      };

      if (response.status === 401) {
        window.location.assign(loginHrefForLegalAi());
        return;
      }

      if (response.status === 402) {
        pendingUploadRef.current = file;
        setAccessGate({
          kind: "billing",
          question: "",
          message: data.error ?? "Баримт хавсаргахад төлбөртэй багц хэрэгтэй.",
        });
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Баримт хавсаргахад алдаа гарлаа.");
      }

      if (data.storageKey || data.key) {
        throw new Error("Баримт хавсаргахад алдаа гарлаа.");
      }

      if (!data.id || !data.fileName || !data.conversationId) {
        throw new Error("Баримт хавсаргахад алдаа гарлаа.");
      }

      const documentId = data.id;
      const documentFileName = data.fileName;
      const extractStatus = data.extractStatus ?? "OK";
      setConversationId(data.conversationId);
      setAttachedDocuments((current) => [
        ...current,
        {
          id: documentId,
          fileName: documentFileName,
          mimeType: data.mimeType ?? "application/octet-stream",
          sizeBytes: data.sizeBytes ?? file.size,
          extractStatus,
          pageCount: data.pageCount ?? null,
        },
      ]);
      if (extractStatus === "NEEDS_OCR") {
        setError(LEGAL_AI_NEEDS_OCR_WARNING);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Баримт хавсаргахад алдаа гарлаа.",
      );
    } finally {
      setUploading(false);
    }
  }

  function toggleMicrophone() {
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();

    if (!SpeechRecognitionCtor) {
      toast.message("Дуу хоолой одоогоор энэ төхөөрөмжид боломжгүй.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "mn-MN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const spoken = event.results[0]?.[0]?.transcript?.trim();
      if (spoken) {
        setMessage((current) => (current ? `${current} ${spoken}` : spoken));
      }
    };
    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      toast.message("Микрофоныг асааж чадсангүй.");
      setListening(false);
    }
  }

  async function sendMessage(text: string, options?: { resume?: boolean }) {
    if (!text || loading) {
      return;
    }

    setError("");
    setAccessGate(null);
    setMessage("");
    clearOrthography();
    if (!options?.resume) {
      setMessages((current) => [...current, { role: "USER", content: text }]);
    }
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    // Set once the streaming assistant placeholder has been appended, so
    // the catch/finally paths know whether there's a partial bubble to
    // clean up on error/abort — an incomplete turn must never linger as a
    // visible (and un-persisted) "successful" message.
    let streamingMessageAdded = false;

    const removeStreamingPlaceholder = () => {
      if (!streamingMessageAdded) return;
      setMessages((current) => current.slice(0, -1));
      streamingMessageAdded = false;
    };

    const appendStreamingDelta = (delta: string) => {
      if (!streamingMessageAdded) {
        streamingMessageAdded = true;
        setMessages((current) => [...current, { role: "ASSISTANT", content: delta }]);
        return;
      }
      setMessages((current) => {
        const next = current.slice();
        const last = next[next.length - 1];
        if (!last || last.role !== "ASSISTANT") return current;
        next[next.length - 1] = { ...last, content: last.content + delta };
        return next;
      });
    };

    const finalizeStreamingMessage = (finalMessage: Message) => {
      if (streamingMessageAdded) {
        setMessages((current) => {
          const next = current.slice();
          next[next.length - 1] = finalMessage;
          return next;
        });
      } else {
        setMessages((current) => [...current, finalMessage]);
      }
      streamingMessageAdded = false;
    };

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          conversationId: conversationIdRef.current,
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        // Every non-streaming response is a pre-LLM failure (auth/billing/
        // rate-limit/validation) — same JSON contract as before streaming
        // existed, handled exactly the same way.
        const data = (await response.json()) as {
          error?: string;
          code?: string;
          conversationId?: string;
          message?: { content?: string; citations?: unknown };
        };

        const interpreted = interpretLegalAiChatAccess({
          status: response.status,
          body: data,
          question: text,
        });

        if (interpreted.type === "auth" || interpreted.type === "billing") {
          setAccessGate(interpreted.gate);
          setMessage(text);
          return;
        }
        if (interpreted.type === "error") {
          throw new Error(interpreted.message);
        }
        return;
      }

      if (!response.body) {
        throw new Error("empty stream body");
      }

      for await (const frame of parseSseStream(response.body)) {
        if (frame.event === "delta") {
          const { text: delta } = frame.data as { text: string };
          if (delta) appendStreamingDelta(delta);
        } else if (frame.event === "done") {
          const payload = frame.data as {
            conversationId?: string;
            message?: { id?: string; content?: string; citations?: unknown };
          };
          setConversationId(payload.conversationId);
          conversationIdRef.current = payload.conversationId;
          finalizeStreamingMessage({
            role: "ASSISTANT",
            content: payload.message?.content ?? "",
            citations: parseSafeCitationsFromUnknown(payload.message?.citations),
          });
          // The composer's attachment strip is a "what I'm about to send"
          // tray, not a running list of everything ever attached to this
          // conversation — clear it once the turn lands (resumed turns
          // included). The document itself stays attached server-side (its
          // extracted text keeps being re-injected on every later turn);
          // only the composer chip goes away.
          setAttachedDocuments([]);
        } else if (frame.event === "error") {
          removeStreamingPlaceholder();
          throw new Error("stream error");
        }
      }
    } catch (err) {
      removeStreamingPlaceholder();
      if (err instanceof DOMException && err.name === "AbortError") {
        // Cancelled by the user via the Stop button — no error to show.
      } else {
        setError(LEGAL_AI_CHAT_RETRY_MESSAGE);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text) {
      return;
    }
    await sendMessage(text);
  }

  const sidebar = (
    <LegalAiSidebar
      onNewConversation={resetConversation}
      onNavigate={() => setMobileNavOpen(false)}
    />
  );

  const isEmpty = messages.length === 0;

  const composer = (
    <form
      onSubmit={handleSubmit}
      className={cn(
        isEmpty
          ? "mt-5 w-full"
          : "border-t border-ai-border bg-ai-surface px-3 py-3 sm:px-6 sm:py-4",
      )}
    >
      <div className={cn(isEmpty ? "w-full" : "mx-auto w-full max-w-3xl")}>
        <div className="rounded-2xl border border-ai-border-strong bg-ai-surface-muted p-2 shadow-[0_12px_32px_-24px_rgba(11,31,58,0.45)] focus-within:border-ai-accent/35">
          {attachedDocuments.length || uploading ? (
            <ul className="mb-2 flex max-h-24 flex-wrap gap-2 overflow-y-auto px-0.5 pt-0.5">
              {attachedDocuments.map((document) => {
                const hint = legalAiExtractStatusHint(document.extractStatus);
                return (
                  <li
                    key={document.id}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-ai-border bg-ai-surface py-1 pr-1.5 pl-2.5 text-xs text-ai-text"
                  >
                    <Paperclip className="size-3.5 shrink-0" />
                    <span className="truncate">{document.fileName}</span>
                    {hint ? (
                      <span className="shrink-0 text-[10px] text-amber-700 dark:text-amber-500">
                        {hint}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`${document.fileName} хасах`}
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-ai-text-subtle hover:bg-ai-accent/8 hover:text-ai-accent"
                      onClick={() => removeAttachedDocument(document.id)}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                );
              })}
              {uploading ? (
                <li className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-ai-border bg-ai-surface py-1 pr-2.5 pl-2.5 text-xs text-ai-text">
                  <Paperclip className="size-3.5 shrink-0" />
                  <span>Файл хавсаргаж байна...</span>
                </li>
              ) : null}
            </ul>
          ) : null}
          <SpellcheckTextarea
            inputRef={messageTextareaRef}
            value={message}
            suggestions={orthographyResult?.suggestions ?? []}
            onChange={setMessage}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Асуудлаа өөрийнхөөрөө бичээрэй. Хуулийн нэр томъёо мэдэх шаардлагагүй."
            rows={1}
            className="min-h-12 w-full text-sm text-ai-text"
            disabled={loading || uploading}
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <div className="flex items-center gap-0.5">
              <input
                ref={documentInputRef}
                type="file"
                accept={LEGAL_AI_DOCUMENT_FILE_ACCEPT}
                className="sr-only"
                onChange={handleDocumentChange}
              />
              {documentUploadEnabled ? (
                <ComposerIconButton
                  label="Баримт хавсаргах"
                  onClick={openDocumentPicker}
                >
                  <Paperclip className="size-4" />
                </ComposerIconButton>
              ) : null}
              <ComposerIconButton
                label={listening ? "Бичлэгийг зогсоох" : "Микрофон"}
                pressed={listening}
                onClick={toggleMicrophone}
              >
                <Mic className="size-4" />
              </ComposerIconButton>
              <OrthographyCheckButton
                loading={orthographyLoading}
                disabled={loading || uploading}
                pressed={orthographyOpen}
                onClick={() => void checkOrthography(message, { mode: "manual" })}
              />
            </div>
            {loading ? (
              <Button
                type="button"
                size="sm"
                onClick={stopGeneration}
                className="gap-1.5 bg-ai-accent text-ai-accent-foreground hover:opacity-90"
              >
                <Square className="size-3 fill-current" />
                Зогсоох
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={!message.trim() || uploading}
                className="gap-1.5 bg-ai-accent text-ai-accent-foreground hover:opacity-90"
              >
                <Send className="size-3.5" />
                Илгээх
              </Button>
            )}
          </div>
        </div>
        <OrthographyStatusBar
          className="mt-2"
          loading={orthographyLoading}
          gateMessage={orthographyGate}
          needsBilling={orthographyNeedsBilling}
          billingHref="/#chat"
          includeLatinToCyrillic={includeLatinToCyrillic}
          onIncludeLatinChange={(value) => {
            setIncludeLatinToCyrillic(value);
            void checkOrthography(message, {
              includeLatinToCyrillic: value,
              mode: "manual",
            });
          }}
        />
        <LegalAiDutyNotice variant="citizen" className="mt-2 px-1" />
      </div>
    </form>
  );

  return (
    <div className="flex h-svh min-h-0 flex-1 overflow-hidden bg-ai-canvas text-ai-text">
      <aside className="hidden w-[17.5rem] shrink-0 lg:flex">{sidebar}</aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-[18rem] max-w-[85vw] gap-0 border-r-0 bg-[#0B1F3A] p-0 text-[#F7FAF8] [&>button]:text-[#F7FAF8]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>TORE Chat цэс</SheetTitle>
            <SheetDescription>Яриа болон холбоосууд</SheetDescription>
          </SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-ai-border bg-ai-surface/90 px-3 backdrop-blur-sm sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              aria-label="Цэс нээх"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="size-4" />
            </Button>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-ai-gold">
                TORE Chat
              </p>
              <p className="truncate text-sm font-medium text-ai-text">
                Таны асуудлыг ойлгож, хуульд тулгуурлан дараагийн алхмыг
                тодорхойлоход тусална.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm">
            {dashboardHref ? (
              <Link
                href={dashboardHref}
                className={cn(buttonVariants({ size: "sm" }))}
              >
                {displayName?.trim() || dashboardLabel}
              </Link>
            ) : (
              <>
                <Link
                  href={loginHrefForLegalAi()}
                  className="hidden cursor-pointer text-ai-text-muted hover:text-ai-accent sm:inline"
                >
                  {signInLabel}
                </Link>
                <Link
                  href={registerClientHrefForLegalAi()}
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  {getStartedLabel}
                </Link>
              </>
            )}
          </div>
        </header>

        {isEmpty ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[45rem] flex-1 flex-col justify-center px-4 py-8 sm:px-6">
              <EmptyWorkspace
                onQuickAction={(prompt) => {
                  setMessage(prompt);
                  setError("");
                }}
              />
              <LegalAiEntitlementBanner />
              {initialQuestion.trim() && !accessGate ? (
                <p className="mt-4 text-sm text-ai-text-muted">
                  Асуултаа илгээхийн тулд Илгээх дарна уу. Автоматаар илгээгдэхгүй.
                </p>
              ) : null}
              {error ? (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  {error}
                </div>
              ) : null}
              {accessGate ? (
                <LegalAiAccessGateCard
                  gate={accessGate}
                  onPaid={resumeAfterAccessGate}
                />
              ) : null}
              {composer}
            </div>
          </div>
        ) : (
          <>
            <div className="relative min-h-0 flex-1">
              <div
                ref={transcriptRef}
                onScroll={handleTranscriptScroll}
                className="h-full overflow-y-auto"
              >
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6">
                  {messages.map((item, index) => (
                    <MessageBubble key={`${item.role}-${index}`} message={item} />
                  ))}
                  {loading && messages[messages.length - 1]?.role !== "ASSISTANT" ? (
                    <div className="flex items-start gap-3">
                      <WorkspaceMark />
                      <div className="rounded-2xl rounded-tl-md border border-ai-border bg-ai-surface px-4 py-3 text-sm text-ai-text-subtle shadow-[0_8px_24px_-16px_rgba(11,31,58,0.35)]">
                        {thinkingStageLabel}
                      </div>
                    </div>
                  ) : null}
                  {error ? (
                    <div
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                    >
                      {error}
                    </div>
                  ) : null}
                  <LegalAiEntitlementBanner />
                  {accessGate ? (
                    <LegalAiAccessGateCard
                      gate={accessGate}
                      onPaid={resumeAfterAccessGate}
                    />
                  ) : null}
                </div>
              </div>

              {showJumpToLatest ? (
                <button
                  type="button"
                  aria-label="Шинэ хариулт руу гүйлгэх"
                  title="Шинэ хариулт"
                  onClick={() => scrollTranscriptToBottom()}
                  className={cn(
                    "absolute bottom-3 left-1/2 z-20 -translate-x-1/2",
                    "inline-flex items-center gap-1.5 rounded-full border border-ai-border-strong bg-ai-surface px-3.5 py-1.5 text-xs font-medium text-ai-accent shadow-lg",
                    "transition hover:bg-ai-surface-muted",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-accent/40",
                  )}
                >
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                  Шинэ хариулт
                </button>
              ) : null}
            </div>
            {composer}
          </>
        )}
      </div>
    </div>
  );
}

function LegalAiSidebar({
  onNewConversation,
  onNavigate,
}: {
  onNewConversation: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col bg-[#0B1F3A] text-[#F7FAF8]">
      <div className="flex h-14 items-center border-b border-white/10 px-4">
        <BrandLink
          className="min-h-9"
          logo={{
            tone: "on-dark",
            markClassName: "size-8",
            wordmarkClassName: "text-[0.95rem] tracking-[-0.02em]",
            className: "gap-3",
          }}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-3 py-4">
        <Button
          type="button"
          onClick={onNewConversation}
          className="h-10 justify-start gap-2 bg-white/8 text-[#F7FAF8] hover:bg-white/12"
        >
          <Plus className="size-4" />
          Шинэ яриа
        </Button>

        <nav className="space-y-1" aria-label="TORE Chat">
          <SidebarLink href={LEGAL_AI_PATH} onClick={onNavigate} active>
            <SquarePen className="size-4" />
            TORE Chat
          </SidebarLink>
          <SidebarLink href="/lawyers" onClick={onNavigate}>
            <Users className="size-4" />
            Хуульч, өмгөөлөгч
          </SidebarLink>
        </nav>

        <div className="mt-auto rounded-xl border border-white/10 bg-white/5 px-3 py-3">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-gold">
            LEGAL. AI. CONNECTED.
          </p>
          <p className="mt-1.5 text-xs leading-5 text-white/65">
            Мэргэжлийн хуульч, өмгөөлөгчийн зөвлөгөөг орлохгүй. Асуудлаа
            шийдвэрлүүлэхийн тулд баталгаажсан хуульч, өмгөөлөгчтэй
            холбогдоно уу.
          </p>
        </div>
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  children,
  onClick,
  active = false,
}: {
  href: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
        active
          ? "bg-white/10 text-white"
          : "text-white/70 hover:bg-white/8 hover:text-white",
      )}
    >
      {children}
    </Link>
  );
}

function EmptyWorkspace({
  onQuickAction,
}: {
  onQuickAction: (prompt: string) => void;
}) {
  const tone = useLogoTone();
  return (
    <div className="w-full">
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-ai-border bg-ai-surface shadow-[0_12px_32px_-18px_rgba(11,31,58,0.4)]">
          <ToreLogo variant="mark" tone={tone} markClassName="size-8" />
        </div>
        <p className="mt-6 text-[11px] font-semibold tracking-[0.18em] text-ai-gold">
          TORE Chat
        </p>
        <h1 className="mt-2 text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.03em] text-ai-text sm:text-[2rem]">
          Танд юу тохиолдсон бэ?
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-[1.6] text-ai-text-muted">
          Таны асуудлыг ойлгож, хуульд тулгуурлан дараагийн алхмыг тодорхойлоход
          тусална.
        </p>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onQuickAction(action.prompt)}
            className="flex items-start gap-3 rounded-2xl border border-ai-border-strong bg-ai-surface px-4 py-3.5 text-left text-sm text-ai-text shadow-[0_10px_24px_-20px_rgba(11,31,58,0.45)] transition hover:border-ai-accent/25 hover:bg-ai-surface-muted"
          >
            <action.icon className="mt-0.5 size-4 shrink-0 text-ai-accent" />
            <span className="font-medium leading-5">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "USER") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ai-accent px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-ai-accent-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <WorkspaceMark />
      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-ai-border bg-ai-surface px-4 py-4 text-sm leading-6 whitespace-pre-wrap text-ai-text shadow-[0_10px_28px_-20px_rgba(11,31,58,0.4)]">
        <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-ai-gold">
          TORE-ийн дүгнэлт
        </p>
        {message.content}
        <LegalAiCitationList citations={message.citations} />
      </div>
    </div>
  );
}

/** Tracks resolved theme for logo tone only — defaults to "on-light" until
 * mounted so this never disagrees with the server-rendered markup. */
function useLogoTone(): "on-light" | "on-dark" {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && resolvedTheme === "dark" ? "on-dark" : "on-light";
}

function WorkspaceMark() {
  const tone = useLogoTone();
  return (
    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-ai-border bg-ai-surface">
      <ToreLogo variant="mark" tone={tone} markClassName="size-5" />
    </div>
  );
}

function ComposerIconButton({
  label,
  children,
  onClick,
  pressed = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-ai-text-muted transition hover:bg-ai-accent/8 hover:text-ai-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-accent/40",
        pressed && "bg-ai-accent/10 text-ai-accent",
      )}
    >
      {children}
    </button>
  );
}

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript?: string }>>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };

  return (
    speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
  );
}
