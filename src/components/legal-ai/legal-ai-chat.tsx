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
  X,
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
import {
  LEGAL_AI_PATH,
  loginHrefForLegalAi,
  registerClientHrefForLegalAi,
} from "@/domain/services/rbac";
import { cn } from "@/lib/utils";

type Message = {
  role: "USER" | "ASSISTANT";
  content: string;
};

type PendingFile = {
  id: string;
  name: string;
  kind: "image" | "document";
};

type LegalAiChatProps = {
  initialQuestion?: string;
  dashboardHref: string | null;
  displayName?: string | null;
  signInLabel: string;
  getStartedLabel: string;
  dashboardLabel: string;
};

const QUICK_ACTIONS = [
  {
    id: "identify",
    label: "Хууль зүйн асуудлаа тодорхойлох",
    icon: Scale,
    prompt:
      "Миний нөхцөл байдал ямар эрх зүйн харилцаанд хамаарахыг тодорхойлоход тусална уу. ",
  },
  {
    id: "rights",
    label: "Эрх, үүргээ мэдэх",
    icon: Shield,
    prompt:
      "Миний нөхцөл байдалд холбогдох ерөнхий эрх, үүргийг ойлгомжтой тайлбарлана уу. ",
  },
  {
    id: "document",
    label: "Баримт бичиг шалгуулах",
    icon: FileText,
    prompt:
      "Баримт бичгээ шалгуулахыг хүсэж байна. Одоогоор файлын шинжилгээ идэвхжээгүй тул агуулгыг текстээр тайлбарлая: ",
  },
  {
    id: "lawyer",
    label: "Хуульч, өмгөөлөгч санал болгох",
    icon: Users,
    prompt:
      "Миний асуудалд ямар чиглэлийн хуульч, өмгөөлөгч тохирохыг тайлбарлана уу. Тодорхой хүнийг зохиож санал болгохгүй байхыг хүсье. ",
  },
] as const;

function nextFileId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function LegalAiChat({
  initialQuestion = "",
  dashboardHref,
  displayName,
  signInLabel,
  getStartedLabel,
  dashboardLabel,
}: LegalAiChatProps) {
  const [message, setMessage] = useState(initialQuestion);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<"CITIZEN" | "PROFESSIONAL">("CITIZEN");
  const [conversationId, setConversationId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [listening, setListening] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
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
    setPendingFiles([]);
    setMessage("");
    setListening(false);
    setMobileNavOpen(false);
  }, []);

  function addFiles(files: FileList | null, kind: PendingFile["kind"]) {
    if (!files?.length) {
      return;
    }
    const next = Array.from(files).map((file) => ({
      id: nextFileId(),
      name: file.name,
      kind,
    }));
    setPendingFiles((current) => [...current, ...next].slice(0, 6));
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(event.target.files, "image");
    event.target.value = "";
  }

  function handleDocumentChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(event.target.files, "document");
    event.target.value = "";
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
    setMessage("");
    setPendingFiles([]);
    setMessages((current) => [...current, { role: "USER", content: text }]);
    setLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
     body: JSON.stringify({
  message: text,
  conversationId,
  mode,
}),
      });

      const data = (await response.json()) as {
        error?: string;
        conversationId?: string;
        message?: { content?: string };
      };

      if (response.status === 401) {
        window.location.assign(loginHrefForLegalAi(text));
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error ?? "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
        );
      }

      setConversationId(data.conversationId);
      setMessages((current) => [
        ...current,
        {
          role: "ASSISTANT",
          content: data.message?.content ?? "",
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
      if (pendingFiles.length > 0) {
        setError(
          "Хавсаргасан файлыг одоогоор шинжлэхгүй. Асуудлаа текстээр бичнэ үү.",
        );
      }
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
        {pendingFiles.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2">
            {pendingFiles.map((file) => (
              <li
                key={file.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#0B1F3A]/10 bg-[#F8FAFC] py-1 pr-1 pl-2.5 text-xs text-[#3F4852]"
              >
                {file.kind === "image" ? (
                  <ImagePlus className="size-3.5 shrink-0" />
                ) : (
                  <Paperclip className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  className="rounded-full p-1 hover:bg-[#0B1F3A]/8"
                  aria-label={`${file.name} хасах`}
                  onClick={() =>
                    setPendingFiles((current) =>
                      current.filter((item) => item.id !== file.id),
                    )
                  }
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
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
            placeholder="Хууль зүйн асуудлаа бичих эсвэл файл хавсаргах..."
            rows={2}
            className="min-h-12 w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-[#0A0F14] outline-none placeholder:text-[#9AA3AD]"
            disabled={loading}
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <div className="flex items-center gap-0.5">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={handleImageChange}
              />
              <input
                ref={documentInputRef}
                type="file"
                accept="application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple
                className="sr-only"
                onChange={handleDocumentChange}
              />
              <ComposerIconButton
                label="Зураг хавсаргах"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus className="size-4" />
              </ComposerIconButton>
              <ComposerIconButton
                label="PDF, баримт хавсаргах"
                onClick={() => documentInputRef.current?.click()}
              >
                <Paperclip className="size-4" />
              </ComposerIconButton>
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
              disabled={!message.trim() || loading}
              className="gap-1.5 bg-[#0B1F3A] text-white hover:bg-[#173A66]"
            >
              <Send className="size-3.5" />
              Илгээх
            </Button>
          </div>
        </div>
        <p className="mt-2 px-1 text-[11px] leading-4 text-[#8A939D]">
          TORE Legal AI нь ерөнхий хууль зүйн мэдээлэл, урьдчилсан чиглэл
          өгнө. Мэргэжлийн зөвлөгөө, төлөөлөл биш. Хавсаргасан файлыг
          одоогоор шинжлэхгүй.
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
            <SheetTitle>TORE Legal AI цэс</SheetTitle>
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
                TORE LEGAL AI
              </p>
              <p className="truncate text-sm font-medium text-[#0A0F14]">
                Хууль зүйн ажлын талбар
              </p>
            </div>
<div className="hidden items-center rounded-lg bg-[#F1F3F5] p-0.5 sm:flex">
  <button
    type="button"
    onClick={() => setMode("CITIZEN")}
    className={cn(
      "rounded-md px-3 py-1.5 text-xs font-medium transition",
      mode === "CITIZEN"
        ? "bg-white text-[#0B1F3A] shadow-sm"
        : "text-[#66717D]",
    )}
  >
    Иргэн
  </button>

  <button
    type="button"
    onClick={() => setMode("PROFESSIONAL")}
    className={cn(
      "rounded-md px-3 py-1.5 text-xs font-medium transition",
      mode === "PROFESSIONAL"
        ? "bg-[#0B1F3A] text-white shadow-sm"
        : "text-[#66717D]",
    )}
  >
    Хуульч / Өмгөөлөгч
  </button>
</div>
          </div><div className="hidden items-center rounded-lg border border-[#D9DEE5] bg-[#F8FAFC] p-1 sm:flex">
  <button
    type="button"
    onClick={() => setMode("CITIZEN")}
    className={cn(
      "rounded-md px-3 py-1.5 text-xs font-medium transition",
      mode === "CITIZEN"
        ? "bg-white text-[#0B1F3A] shadow-sm"
        : "text-[#66717D] hover:text-[#0B1F3A]",
    )}
  >
    Иргэн
  </button>

  <button
    type="button"
    onClick={() => setMode("PROFESSIONAL")}
    className={cn(
      "rounded-md px-3 py-1.5 text-xs font-medium transition",
      mode === "PROFESSIONAL"
        ? "bg-[#0B1F3A] text-white shadow-sm"
        : "text-[#66717D] hover:text-[#0B1F3A]",
    )}
  >
    Хуульч / Өмгөөлөгч
  </button>
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
              {error ? (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </div>
              ) : null}
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
                      TORE Legal AI хариулж байна...
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

        <nav className="space-y-1" aria-label="Legal AI">
          <SidebarLink href={LEGAL_AI_PATH} onClick={onNavigate} active>
            <SquarePen className="size-4" />
            Legal AI
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
          TORE LEGAL AI
        </p>
        <h1 className="mt-2 text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.03em] text-[#0A0F14] sm:text-[2rem]">
          Хууль зүйн асуудлаа бичнэ үү
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-[1.6] text-[#5C6570]">
          Нөхцөл байдлаа энгийнээр тайлбарлаарай. Таны нөхцөл байдлыг ойлгож,
          холбогдох эрх зүйн чиглэлийг тодорхойлоход тусална.
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
        {message.content}
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
