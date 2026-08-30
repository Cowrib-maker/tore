"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ChevronRight,
  FileText,
  FolderOpen,
  History,
  LoaderCircle,
  PanelRight,
  Paperclip,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";

import { LEGAL_AI_DOCUMENT_FILE_ACCEPT } from "@/application/ai/legal-ai-document.constants";
import {
  clientRejectLegalAiDocument,
  legalAiExtractStatusHint,
} from "@/application/ai/legal-ai-document-file";
import {
  parseSafeCitationsFromUnknown,
  type LegalAiSafeCitation,
} from "@/application/ai/legal-ai-citation";
import type {
  LawyerAiCaseContext,
  LawyerAiHistoryItem,
} from "@/application/use-cases/ai/load-lawyer-ai-workbench";
import { interpretLegalAiChatAccess } from "@/components/legal-ai/interpret-legal-ai-chat-access";
import type { LegalAiAccessGate } from "@/components/legal-ai/interpret-legal-ai-chat-access";
import { LegalAiAccessGateCard } from "@/components/legal-ai/legal-ai-access-gate";
import { LegalAiCitationList } from "@/components/legal-ai/legal-ai-citation-list";
import { LegalAiEntitlementBanner } from "@/components/legal-ai/legal-ai-entitlement-banner";
import { ToreLogo } from "@/components/brand/tore-logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { loginHrefForLegalAi } from "@/domain/services/rbac";
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

type Props = {
  initialConversationId?: string;
  initialCaseFileId?: string;
  initialMessages?: Message[];
  initialAttachedDocuments?: AttachedDocument[];
  caseContext: LawyerAiCaseContext | null;
  history: LawyerAiHistoryItem[];
};

const CASE_SUGGESTIONS = [
  {
    label: "Хэрэг шинжлэх",
    prompt: "Энэ хэргийг хууль зүйн асуудал, баримт, холбогдох зохицуулалтаар шинжил.",
  },
  {
    label: "Хууль зүйн судалгаа",
    prompt: "Энэ хэрэгт холбоотой Монгол Улсын хуулийн зүйлүүдийг баталгаатай эхээс гарга.",
  },
  {
    label: "Баримт шинжлэх",
    prompt: "Хэргийн баримт, баримт бичгийг шинжилж, тогтоогдсон болон маргаантай зүйлийг ялга.",
  },
  {
    label: "Нотлох баримт үнэлэх",
    prompt: "Нотлох баримтын дэмжлэг, дутуу баримт, зөрчлийг үнэл.",
  },
  {
    label: "Эсрэг байр суурь боловсруулах",
    prompt: "Яллах/нэхэмжлэлийн болон хамгаалалтын эсрэг байр суурийг боловсруул.",
  },
  {
    label: "Баримт бичиг боловсруулах",
    prompt: "Энэ хэрэгт хэрэгтэй мэргэжлийн баримт бичгийн төслийг боловсруул.",
  },
] as const;

const OPEN_SUGGESTIONS = [
  {
    label: "Хэрэг шинжлэх",
    prompt: "Хэргийг шинжлэхдээ ямар дараалал баримтлах вэ?",
  },
  {
    label: "Хууль зүйн судалгаа",
    prompt: "Хууль зүйн судалгааг баталгаатай эх сурвалжид тулгуурлан хэрхэн хийх вэ?",
  },
  {
    label: "Баримт шинжлэх",
    prompt: "Гэрээ, баримт бичгийг хэрхэн мэргэжлийн түвшинд шинжлэх вэ?",
  },
  {
    label: "Нотлох баримт үнэлэх",
    prompt: "Нотлох баримтыг хэрхэн үнэлж, дутуу баримтыг хэрхэн тодорхойлох вэ?",
  },
  {
    label: "Эсрэг байр суурь боловсруулах",
    prompt: "Иргэний маргаанд эсрэг байр суурь, хамгаалалтын аргументыг хэрхэн боловсруулах вэ?",
  },
  {
    label: "Баримт бичиг боловсруулах",
    prompt: "Нэхэмжлэл, хариу, гэрээний төслийг хэрхэн боловсруулах вэ?",
  },
] as const;

export function LawyerAiWorkbench({
  initialConversationId,
  initialCaseFileId,
  initialMessages = [],
  initialAttachedDocuments = [],
  caseContext,
  history,
}: Props) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [caseFileId] = useState(initialCaseFileId);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [attachedDocuments, setAttachedDocuments] =
    useState<AttachedDocument[]>(initialAttachedDocuments);
  const [accessGate, setAccessGate] = useState<LegalAiAccessGate | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const conversationMode =
    messages.length > 0 ||
    draft.trim().length > 0 ||
    loading ||
    Boolean(attachedDocuments.length);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    if (!conversationId || typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("conversationId", conversationId);
    if (caseFileId) params.set("caseId", caseFileId);
    const next = `/legal-ai?${params.toString()}`;
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [conversationId, caseFileId]);

  async function uploadPdf(file: File) {
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
      const response = await fetch("/api/lawyer/ai/documents", {
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
      setConversationId(data.conversationId);
      setAttachedDocuments((current) => [
        ...current,
        {
          id: documentId,
          fileName: documentFileName,
          mimeType: data.mimeType ?? "application/pdf",
          sizeBytes: data.sizeBytes ?? file.size,
          extractStatus: data.extractStatus ?? "OK",
          pageCount: data.pageCount ?? null,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Баримт хавсаргахад алдаа гарлаа.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDocumentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await uploadPdf(file);
  }

  async function sendMessage(text: string) {
    if (!text || loading) return;
    setError("");
    setAccessGate(null);
    setDraft("");
    setMessages((current) => [...current, { role: "USER", content: text }]);
    setLoading(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId,
          caseFileId: conversationId ? undefined : caseFileId,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        conversationId?: string;
        message?: { content?: string; citations?: unknown };
        code?: string;
      };
      const interpreted = interpretLegalAiChatAccess({
        status: response.status,
        body: data,
        question: text,
      });
      if (interpreted.type === "auth") {
        setAccessGate(interpreted.gate);
        setDraft(text);
        return;
      }
      if (interpreted.type === "billing") {
        setAccessGate(interpreted.gate);
        setDraft(text);
        return;
      }
      if (interpreted.type === "error") {
        throw new Error(interpreted.message);
      }
      setConversationId(data.conversationId);
      setMessages((current) => [
        ...current,
        {
          role: "ASSISTANT",
          content: data.message?.content ?? "",
          citations: parseSafeCitationsFromUnknown(data.message?.citations),
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (text) await sendMessage(text);
  }

  const suggestions = caseContext ? CASE_SUGGESTIONS : OPEN_SUGGESTIONS;
  const caseHref = caseContext
    ? `/lawyer/workspace/case-review?caseId=${encodeURIComponent(caseContext.caseId)}`
    : null;

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden bg-[#F4F2EE]"
      data-testid="lawyer-ai-workbench"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#0B1F3A]/8 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            {caseContext ? (
              <div data-testid="lawyer-ai-case-header">
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8A6B2A]">
                  TORE Legal AI
                </p>
                <h1 className="truncate text-[1.05rem] font-semibold text-[#0B1F3A]">
                  {caseContext.title}
                </h1>
                <p className="text-xs text-[#5C6570]">
                  Хэрэг, баримт, хууль зүйн эх сурвалжид тулгуурлан мэргэжлийн
                  түвшний шинжилгээ хийх AI.
                </p>
                <p className="mt-1 hidden text-[11px] text-[#8A939D] sm:block">
                  Баримт {caseContext.documentCount}
                  <span className="mx-1.5">·</span>
                  AI яриа {caseContext.conversationCount}
                  <span className="mx-1.5">·</span>
                  {caseContext.analysisStatusLabel}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8A6B2A]">
                  TORE Legal AI
                </p>
                <h1 className="text-[1.05rem] font-semibold text-[#0B1F3A]">
                  TORE Legal AI
                </h1>
                <p className="text-xs text-[#5C6570]">
                  Хэрэг, баримт, хууль зүйн эх сурвалжид тулгуурлан мэргэжлийн
                  түвшний шинжилгээ хийх AI.
                </p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconToggle
              label="Ярианы түүх"
              pressed={historyOpen}
              onClick={() => setHistoryOpen(true)}
            >
              <History className="size-4" />
            </IconToggle>
            <IconToggle
              label="Хэргийн мэдээлэл"
              pressed={panelOpen}
              className="hidden lg:inline-flex"
              onClick={() => setPanelOpen((open) => !open)}
            >
              <PanelRight className="size-4" />
            </IconToggle>
            <IconToggle
              label="Хэргийн мэдээлэл"
              pressed={false}
              className="lg:hidden"
              onClick={() => setMobilePanelOpen(true)}
            >
              <PanelRight className="size-4" />
            </IconToggle>
          </div>
        </header>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            conversationMode ? "justify-end" : "justify-center",
          )}
        >
          <div
            className={cn(
              "mx-auto w-full max-w-[1040px] px-4 transition-all duration-300 ease-out sm:px-6",
              conversationMode
                ? "pointer-events-none max-h-0 overflow-hidden -translate-y-2 opacity-0"
                : "max-h-[22rem] translate-y-0 opacity-100",
            )}
            aria-hidden={conversationMode}
            data-testid="lawyer-ai-welcome"
          >
            <Welcome
              caseLinked={Boolean(caseContext)}
              suggestions={suggestions}
              onSuggest={(prompt) => {
                setDraft(prompt);
                textareaRef.current?.focus();
              }}
            />
          </div>

          <div
            ref={transcriptRef}
            className={cn(
              "min-h-0 overflow-y-auto transition-[flex-grow,min-height] duration-300 ease-out",
              conversationMode ? "min-h-0 flex-1" : "h-0 flex-none overflow-hidden",
            )}
          >
            <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-6 sm:px-6">
              {messages.map((item, index) => (
                <MessageBubble
                  key={`${item.role}-${index}`}
                  message={item}
                  appear={item.role === "ASSISTANT"}
                />
              ))}
              {loading ? (
                <div className="flex items-start gap-3">
                  <AiMark />
                  <div className="rounded-2xl rounded-tl-md border border-[#0B1F3A]/8 bg-white px-4 py-3 text-sm text-[#66717D]">
                    <span className="inline-flex items-center gap-2">
                      <LoaderCircle className="size-3.5 animate-spin text-[#6B5B95]" />
                      TORE хариулж байна...
                    </span>
                  </div>
                </div>
              ) : null}
              {error ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </div>
              ) : null}
              {accessGate ? <LegalAiAccessGateCard gate={accessGate} /> : null}
            </div>
          </div>

          <div className="shrink-0 pb-4 pt-2 sm:pb-6">
            <form
              onSubmit={handleSubmit}
              className="mx-auto w-full max-w-[1040px] px-4 sm:px-6"
              data-testid="lawyer-ai-composer"
            >
              {!conversationMode ? (
                <div className="mb-4">
                  <LegalAiEntitlementBanner />
                </div>
              ) : null}
              {attachedDocuments.length || uploading ? (
                <ul className="mb-2 flex flex-wrap gap-2">
                  {attachedDocuments.map((document) => {
                    const hint = legalAiExtractStatusHint(document.extractStatus);
                    return (
                      <li
                        key={document.id}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-[#3F4852] ring-1 ring-[#0B1F3A]/10"
                      >
                        <Paperclip className="size-3.5" />
                        <span className="truncate">{document.fileName}</span>
                        {hint ? (
                          <span className="shrink-0 text-[10px] text-amber-700">
                            {hint}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                  {uploading ? (
                    <li className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-[#3F4852] ring-1 ring-[#0B1F3A]/10">
                      <Paperclip className="size-3.5" />
                      <span>Файл хавсаргаж байна...</span>
                    </li>
                  ) : null}
                </ul>
              ) : null}
              <div className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-2 shadow-[0_16px_40px_-28px_rgba(11,31,58,0.45)] focus-within:border-[#0F3D33]/40">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={
                    caseContext
                      ? "Энэ хэрэг дээр юу хийх вэ?"
                      : "Юу дээр ажиллах вэ?"
                  }
                  rows={conversationMode ? 2 : 4}
                  className="min-h-16 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-[#0B1F3A] outline-none placeholder:text-[#9AA3AD]"
                  disabled={loading || uploading}
                />
                <div className="flex items-center justify-between gap-2 px-1 pb-1">
                  <div>
                    <input
                      ref={documentInputRef}
                      type="file"
                      accept={LEGAL_AI_DOCUMENT_FILE_ACCEPT}
                      className="sr-only"
                      onChange={handleDocumentChange}
                    />
                    <button
                      type="button"
                      aria-label="Баримт хавсаргах"
                      onClick={() => {
                        if (!uploading) {
                          documentInputRef.current?.click();
                        }
                      }}
                      className="inline-flex size-9 items-center justify-center rounded-lg text-[#5C6570] transition hover:bg-[#EAF4F0] hover:text-[#0F3D33]"
                    >
                      <Paperclip className="size-4" />
                    </button>
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!draft.trim() || loading || uploading}
                    className="gap-1.5 bg-[#0F3D33] text-white hover:bg-[#145244]"
                  >
                    <Send className="size-3.5" />
                    Илгээх
                  </Button>
                </div>
              </div>
              <p className="mt-2 px-1 text-[11px] leading-4 text-[#8A939D]">
                TORE Legal AI нь ерөнхий хууль зүйн мэдээлэл өгнө. Хуульч,
                өмгөөлөгчийг орлохгүй.
              </p>
            </form>
          </div>
        </div>
      </div>

      <aside
        className={cn(
          "hidden min-h-0 shrink-0 overflow-hidden border-l border-[#0B1F3A]/8 bg-white transition-[width] duration-200 ease-out lg:block",
          panelOpen ? "w-[280px]" : "w-0 border-l-0",
        )}
        data-testid="lawyer-ai-context"
      >
        {panelOpen ? (
          <ContextPanel caseContext={caseContext} caseHref={caseHref} />
        ) : null}
      </aside>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent
          side="left"
          className="w-[300px] border-[#0B1F3A]/8 bg-[#F4F2EE] p-0 sm:max-w-[300px]"
        >
          <SheetHeader className="border-b border-[#0B1F3A]/8 px-4 py-4">
            <SheetTitle className="text-[#0B1F3A]">Ярианы түүх</SheetTitle>
          </SheetHeader>
          <div className="p-3" data-testid="lawyer-ai-history">
            <Link
              href={
                caseFileId
                  ? `/legal-ai?caseId=${encodeURIComponent(caseFileId)}`
                  : "/legal-ai"
              }
              className="mb-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#0F3D33] text-sm font-medium text-white"
            >
              <Plus className="size-4" />
              Шинэ яриа
            </Link>
            {history.length === 0 ? (
              <p className="px-1 text-sm text-[#5C6570]">Хадгалсан яриа алга.</p>
            ) : (
              <ul className="space-y-1">
                {history.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/legal-ai?conversationId=${encodeURIComponent(item.id)}`}
                      className={cn(
                        "block rounded-lg px-3 py-2.5 hover:bg-white",
                        item.id === conversationId && "bg-white",
                      )}
                    >
                      <span className="block truncate text-sm font-medium text-[#0B1F3A]">
                        {item.title}
                      </span>
                      {item.caseTitle ? (
                        <span className="mt-0.5 block truncate text-xs text-[#5C6570]">
                          {item.caseTitle}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
        <SheetContent
          side="right"
          className="w-[300px] border-[#0B1F3A]/8 bg-white p-0 sm:max-w-[300px] lg:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Хэргийн мэдээлэл</SheetTitle>
          </SheetHeader>
          <ContextPanel caseContext={caseContext} caseHref={caseHref} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Welcome({
  caseLinked,
  suggestions,
  onSuggest,
}: {
  caseLinked: boolean;
  suggestions: readonly { label: string; prompt: string }[];
  onSuggest: (prompt: string) => void;
}) {
  return (
    <div className="pt-6 text-center sm:pt-10">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white shadow-[0_12px_28px_-18px_rgba(11,31,58,0.4)] ring-1 ring-[#0B1F3A]/8">
        <ToreLogo variant="mark" tone="on-light" markClassName="size-7" />
      </div>
      <h2 className="mt-5 text-[1.65rem] font-semibold tracking-tight text-[#0B1F3A]">
        {caseLinked ? "Энэ хэрэг дээр юу хийх вэ?" : "Юу дээр ажиллах вэ?"}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#5C6570]">
        Хэрэг, баримт, хууль зүйн эх сурвалжид тулгуурлан мэргэжлийн түвшний
        шинжилгээ хийх AI.
      </p>
      <div className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-2">
        {suggestions.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onSuggest(item.prompt)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#0F3D33] ring-1 ring-[#0B1F3A]/10 transition hover:bg-[#EAF4F0]"
          >
            <Sparkles className="size-3" />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  appear,
}: {
  message: Message;
  appear: boolean;
}) {
  if (message.role === "USER") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#0B1F3A] px-4 py-3 text-[15px] leading-7 whitespace-pre-wrap text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3",
        appear && "animate-in fade-in slide-in-from-bottom-1 duration-300",
      )}
    >
      <AiMark />
      <div className="max-w-[90%] rounded-2xl rounded-tl-md border border-[#0B1F3A]/8 bg-white px-4 py-4 text-[15px] leading-7 whitespace-pre-wrap text-[#3F4852] shadow-[0_10px_28px_-22px_rgba(11,31,58,0.4)]">
        <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-[#8A6B2A]">
          TORE-ийн дүгнэлт
        </p>
        {message.content}
        <LegalAiCitationList citations={message.citations} />
      </div>
    </div>
  );
}

function AiMark() {
  return (
    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#F3EEF8] ring-1 ring-[#6B5B95]/15">
      <ToreLogo variant="mark" tone="on-light" markClassName="size-5" />
    </div>
  );
}

function ContextPanel({
  caseContext,
  caseHref,
}: {
  caseContext: LawyerAiCaseContext | null;
  caseHref: string | null;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4">
      <h2 className="text-[11px] font-semibold tracking-[0.08em] text-[#8A939D] uppercase">
        Хэргийн мэдээлэл
      </h2>
      {caseContext && caseHref ? (
        <>
          <p className="mt-3 text-sm font-semibold text-[#0B1F3A]">
            {caseContext.title}
          </p>
          <Link
            href={caseHref}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#0F3D33]"
          >
            Хэрэг нээх
            <ChevronRight className="size-4" />
          </Link>
          <div className="mt-5">
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-[#8A939D] uppercase">
              Баримт бичиг
            </h3>
            {caseContext.documents.length === 0 ? (
              <p className="mt-2 text-sm text-[#5C6570]">Хавсаргасан баримт алга.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {caseContext.documents.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 text-sm text-[#0B1F3A]"
                  >
                    <FileText className="size-3.5 text-[#0F3D33]" />
                    <span className="truncate">{item.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-5">
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-[#8A939D] uppercase">
              Хэрэг шинжилгээ
            </h3>
            <p className="mt-2 text-sm text-[#0B1F3A]">
              {caseContext.analysisStatusLabel}
            </p>
            <Link
              href={`${caseHref}#case-analysis`}
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#0F3D33]"
            >
              Шинжилгээ рүү очих
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[#5C6570]">
          Энэ яриа хэрэгт холбогдоогүй. Хэргээс AI нээвэл энд мэдээлэл
          харагдана.
        </p>
      )}
      <Link
        href="/lawyer/workspace/cases"
        className="mt-auto inline-flex items-center gap-2 pt-6 text-sm text-[#5C6570] hover:text-[#0B1F3A]"
      >
        <FolderOpen className="size-4" />
        Хэргүүд
      </Link>
    </div>
  );
}

function IconToggle({
  label,
  pressed,
  onClick,
  children,
  className,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-[#5C6570] transition hover:bg-white hover:text-[#0B1F3A]",
        pressed && "bg-white text-[#0F3D33]",
        className,
      )}
    >
      {children}
    </button>
  );
}
