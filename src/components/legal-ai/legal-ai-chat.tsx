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
  FileText,
  ImagePlus,
  Menu,
  Mic,
  Paperclip,
  Plus,
  Scale,
  Send,
  Shield,
  SquarePen,
  Users,
} from "lucide-react";
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
import { LEGAL_AI_DOCUMENT_MAX_BYTES } from "@/application/ai/legal-ai-document.constants";
import {
  parseSafeCitationsFromUnknown,
  type LegalAiSafeCitation,
} from "@/application/ai/legal-ai-citation";
import { LegalAiCitationList } from "@/components/legal-ai/legal-ai-citation-list";
import { interpretLegalAiChatAccess } from "@/components/legal-ai/interpret-legal-ai-chat-access";
import { LegalAiAccessGateCard } from "@/components/legal-ai/legal-ai-access-gate";
import { LegalAiEntitlementBanner } from "@/components/legal-ai/legal-ai-entitlement-banner";
import { requestCitizenCheckout } from "@/components/legal-ai/request-citizen-checkout";
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
  extractStatus: "OK" | "EMPTY" | "FAILED";
  pageCount: number | null;
};

type LegalAiChatProps = {
  initialQuestion?: string;
  initialConversationId?: string;
  initialMessages?: Message[];
  initialAttachedDocument?: AttachedDocument | null;
  documentUploadEnabled?: boolean;
  dashboardHref: string | null;
  displayName?: string | null;
  signInLabel: string;
  getStartedLabel: string;
  dashboardLabel: string;
};

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
  initialAttachedDocument = null,
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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [attachedDocument, setAttachedDocument] = useState<AttachedDocument | null>(
    initialAttachedDocument,
  );
  const [listening, setListening] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accessGate, setAccessGate] = useState<null | {
    kind: "auth" | "billing";
    question: string;
    message: string;
    checkout?: {
      qrImage: string | null;
      shortUrl: string | null;
      amountMnt: number;
      planCode: string;
    } | null;
    checkoutError?: string;
  }>(null);

  const documentInputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
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
    setAttachedDocument(null);
    setMessage("");
    setListening(false);
    setMobileNavOpen(false);
  }, []);

  function handleUnsupportedImage() {
    setError(
      "Зураг болон OCR одоогоор дэмжигдэхгүй. Native-text PDF хавсаргана уу.",
    );
    toast.message("Зураг одоогоор дэмжигдэхгүй.");
  }

  async function startCitizenCheckout(): Promise<{
    view: {
      qrImage: string | null;
      shortUrl: string | null;
      amountMnt: number;
      planCode: string;
    } | null;
    error?: string;
  }> {
    return requestCitizenCheckout({ enabled: Boolean(dashboardHref) });
  }

  async function handleDocumentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    await uploadPdf(file);
  }

  async function uploadPdf(file: File) {
    if (!documentUploadEnabled) {
      setError("PDF хавсаргах нь хуульчийн эрхтэй хэрэглэгчид зориулагдсан.");
      return;
    }
    if (attachedDocument) {
      setError("Энэ ярианд аль хэдийн нэг PDF хавсаргасан байна.");
      return;
    }
    if (!isNativePdfFile(file)) {
      setError(
        "Одоогоор зөвхөн PDF файлыг шинжилнэ. DOCX, DOC, зураг, скан хийсэн PDF-ийг дэмжихгүй.",
      );
      return;
    }
    if (file.size > LEGAL_AI_DOCUMENT_MAX_BYTES) {
      setError("Файл 10MB-аас ихгүй байх ёстой.");
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

      setConversationId(data.conversationId);
      setAttachedDocument({
        id: data.id,
        fileName: data.fileName,
        mimeType: data.mimeType ?? "application/pdf",
        sizeBytes: data.sizeBytes ?? file.size,
        extractStatus: data.extractStatus ?? "OK",
        pageCount: data.pageCount ?? null,
      });
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

  async function sendMessage(text: string) {
    if (!text || loading) {
      return;
    }

    setError("");
    setAccessGate(null);
    setMessage("");
    setMessages((current) => [...current, { role: "USER", content: text }]);
    setLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          conversationId,
        }),
      });

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

      if (interpreted.type === "auth") {
        setAccessGate(interpreted.gate);
        setMessage(text);
        return;
      }

      if (interpreted.type === "billing") {
        const checkout = await startCitizenCheckout();
        setAccessGate({
          ...interpreted.gate,
          checkout: checkout.view,
          checkoutError: checkout.error,
        });
        setMessage(text);
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
          : "border-t border-[#0B1F3A]/8 bg-white px-3 py-3 sm:px-6 sm:py-4",
      )}
    >
      <div className={cn(isEmpty ? "w-full" : "mx-auto w-full max-w-3xl")}>
        {attachedDocument || uploading ? (
          <ul className="mb-2 flex flex-wrap gap-2">
            {attachedDocument ? (
              <li className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#0B1F3A]/10 bg-[#F8FAFC] py-1 pr-2.5 pl-2.5 text-xs text-[#3F4852]">
                <Paperclip className="size-3.5 shrink-0" />
                <span className="truncate">{attachedDocument.fileName}</span>
              </li>
            ) : (
              <li className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#0B1F3A]/10 bg-[#F8FAFC] py-1 pr-2.5 pl-2.5 text-xs text-[#3F4852]">
                <Paperclip className="size-3.5 shrink-0" />
                <span>PDF хавсаргаж байна...</span>
              </li>
            )}
          </ul>
        ) : null}

        <div className="rounded-2xl border border-[#D9DEE5] bg-[#F8FAFC] p-2 shadow-[0_12px_32px_-24px_rgba(11,31,58,0.45)] focus-within:border-[#0B1F3A]/35">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Асуудлаа өөрийнхөөрөө бичээрэй. Хуулийн нэр томъёо мэдэх шаардлагагүй."
            rows={2}
            className="min-h-12 w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-[#0A0F14] outline-none placeholder:text-[#9AA3AD]"
            disabled={loading || uploading}
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <div className="flex items-center gap-0.5">
              <input
                ref={documentInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={handleDocumentChange}
              />
              <ComposerIconButton
                label="Зураг хавсаргах"
                onClick={handleUnsupportedImage}
              >
                <ImagePlus className="size-4" />
              </ComposerIconButton>
              {documentUploadEnabled ? (
              <ComposerIconButton
                label="PDF хавсаргах"
                onClick={() => {
                  if (!uploading && !attachedDocument) {
                    documentInputRef.current?.click();
                  }
                }}
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
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={!message.trim() || loading || uploading}
              className="gap-1.5 bg-[#0B1F3A] text-white hover:bg-[#173A66]"
            >
              <Send className="size-3.5" />
              Илгээх
            </Button>
          </div>
        </div>
        <p className="mt-2 px-1 text-[11px] leading-4 text-[#8A939D]">
          TORE Chat нь ерөнхий хууль зүйн мэдээлэл, урьдчилсан чиглэл өгнө.
          Мэргэжлийн зөвлөгөө, төлөөлөл биш.
        </p>
      </div>
    </form>
  );

  return (
    <div className="flex h-svh min-h-0 flex-1 overflow-hidden bg-[#FAF9F7] text-[#0A0F14]">
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[#0B1F3A]/8 bg-white/90 px-3 backdrop-blur-sm sm:px-5">
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
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8A6B2A]">
                TORE Chat
              </p>
              <p className="truncate text-sm font-medium text-[#0A0F14]">
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
                  className="hidden cursor-pointer text-[#5C6570] hover:text-[#0B1F3A] sm:inline"
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
                <p className="mt-4 text-sm text-[#5C6570]">
                  Асуултаа илгээхийн тулд Илгээх дарна уу. Автоматаар илгээгдэхгүй.
                </p>
              ) : null}
              {error ? (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </div>
              ) : null}
              {accessGate ? <LegalAiAccessGateCard gate={accessGate} /> : null}
              {composer}
            </div>
          </div>
        ) : (
          <>
            <div
              ref={transcriptRef}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6">
                {messages.map((item, index) => (
                  <MessageBubble key={`${item.role}-${index}`} message={item} />
                ))}
                {loading ? (
                  <div className="flex items-start gap-3">
                    <WorkspaceMark />
                    <div className="rounded-2xl rounded-tl-md border border-[#0B1F3A]/8 bg-white px-4 py-3 text-sm text-[#66717D] shadow-[0_8px_24px_-16px_rgba(11,31,58,0.35)]">
                      TORE Chat хариулж байна...
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
                <LegalAiEntitlementBanner />
                {accessGate ? <LegalAiAccessGateCard gate={accessGate} /> : null}
              </div>
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
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#C8A45D]">
            LEGAL. AI. CONNECTED.
          </p>
          <p className="mt-1.5 text-xs leading-5 text-white/65">
            Ерөнхий мэдээлэл өгнө. Таны хуульч, өмгөөлөгч биш.
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
  return (
    <div className="w-full">
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-[#0B1F3A]/8 bg-white shadow-[0_12px_32px_-18px_rgba(11,31,58,0.4)]">
          <ToreLogo variant="mark" tone="on-light" markClassName="size-8" />
        </div>
        <p className="mt-6 text-[11px] font-semibold tracking-[0.18em] text-[#8A6B2A]">
          TORE Chat
        </p>
        <h1 className="mt-2 text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.03em] text-[#0A0F14] sm:text-[2rem]">
          Танд юу тохиолдсон бэ?
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-[1.6] text-[#5C6570]">
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
            className="flex items-start gap-3 rounded-2xl border border-[#0B1F3A]/10 bg-white px-4 py-3.5 text-left text-sm text-[#3F4852] shadow-[0_10px_24px_-20px_rgba(11,31,58,0.45)] transition hover:border-[#0B1F3A]/25 hover:bg-[#F8FAFC]"
          >
            <action.icon className="mt-0.5 size-4 shrink-0 text-[#0B1F3A]" />
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
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#0B1F3A] px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <WorkspaceMark />
      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-[#0B1F3A]/8 bg-white px-4 py-4 text-sm leading-6 whitespace-pre-wrap text-[#3F4852] shadow-[0_10px_28px_-20px_rgba(11,31,58,0.4)]">
        <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-[#8A6B2A]">
          TORE-ийн дүгнэлт
        </p>
        {message.content}
        <LegalAiCitationList citations={message.citations} />
      </div>
    </div>
  );
}

function WorkspaceMark() {
  return (
    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#0B1F3A]/8 bg-white">
      <ToreLogo variant="mark" tone="on-light" markClassName="size-5" />
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
        "inline-flex size-9 items-center justify-center rounded-lg text-[#5C6570] transition hover:bg-[#0B1F3A]/8 hover:text-[#0B1F3A]",
        pressed && "bg-[#0B1F3A]/10 text-[#0B1F3A]",
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

function isNativePdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (name.endsWith(".doc") || name.endsWith(".docx")) {
    return false;
  }
  if (type.startsWith("image/")) {
    return false;
  }
  return type === "application/pdf" || name.endsWith(".pdf");
}

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
