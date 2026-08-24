"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Paperclip, Send, Sparkles } from "lucide-react";

import { LEGAL_AI_DOCUMENT_MAX_BYTES } from "@/application/ai/legal-ai-document.constants";
import {
  useLegalAiChatSession,
  type ChatMessage,
} from "@/components/legal-ai/use-legal-ai-chat-session";
import { cn } from "@/lib/utils";

type SectionKey = "case-file" | "documents" | "ai" | "research" | "notes";

type AttachedDocument = {
  id: string;
  fileName: string;
  extractStatus: "OK" | "EMPTY" | "FAILED";
  pageCount: number | null;
};

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: "case-file", label: "Хэргийн файл" },
  { key: "documents", label: "Баримт бичиг" },
  { key: "ai", label: "AI туслах" },
  { key: "research", label: "Судалгаа" },
  { key: "notes", label: "Тэмдэглэл" },
];

function isNativePdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return type === "application/pdf" || name.endsWith(".pdf");
}

export function WorkspaceShell() {
  const [active, setActive] = useState<SectionKey>("case-file");
  const [caseFileNotes, setCaseFileNotes] = useState("");
  const [researchNotes, setResearchNotes] = useState("");
  const [freeNotes, setFreeNotes] = useState("");

  const {
    messages,
    conversationId,
    loading,
    error: chatError,
    accessGate,
    sendMessage,
    setConversationId,
  } = useLegalAiChatSession();

  const [message, setMessage] = useState("");
  const [attachedDocument, setAttachedDocument] =
    useState<AttachedDocument | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    if (attachedDocument) {
      setUploadError("Энэ хэрэгт аль хэдийн 1 файл хавсаргасан байна.");
      return;
    }
    if (!isNativePdfFile(file)) {
      setUploadError(
        "Одоогоор зөвхөн жинхэнэ (скан хийгээгүй) PDF файлыг шинжилнэ.",
      );
      return;
    }
    if (file.size > LEGAL_AI_DOCUMENT_MAX_BYTES) {
      setUploadError("Файл 10MB-аас ихгүй байх ёстой.");
      return;
    }

    setUploadError(null);
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
        extractStatus?: AttachedDocument["extractStatus"];
        pageCount?: number | null;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Файл хавсаргахад алдаа гарлаа.");
      }
      if (!data.id || !data.fileName || !data.conversationId) {
        throw new Error("Файл хавсаргахад алдаа гарлаа.");
      }

      setConversationId(data.conversationId);
      setAttachedDocument({
        id: data.id,
        fileName: data.fileName,
        extractStatus: data.extractStatus ?? "OK",
        pageCount: data.pageCount ?? null,
      });
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Файл хавсаргахад алдаа гарлаа.",
      );
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || loading) return;
    setMessage("");
    await sendMessage(text, "PROFESSIONAL");
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden rounded-xl border bg-white">
      <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r p-2">
        {SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => setActive(section.key)}
            className={cn(
              "rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
              active === section.key
                ? "bg-[#0B1F3A] text-white"
                : "text-[#3F4852] hover:bg-[#0B1F3A]/5",
            )}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {active === "case-file" ? (
          <NotesSection
            heading="Хэргийн файл"
            help="Хэргийн үндсэн мэдээллийг энд тэмдэглэ (одоохондоо зөвхөн энэ browser дээр хадгалагдана)."
            value={caseFileNotes}
            onChange={setCaseFileNotes}
            placeholder="Хэргийн дугаар, талууд, гол нөхцөл байдал..."
          />
        ) : null}

        {active === "documents" ? (
          <div className="grid gap-3">
            <div>
              <h2 className="text-sm font-semibold">Баримт бичиг</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                PDF хавсаргах — TORE Legal AI үүн дээр үндэслэн шинжилгээ
                хийж, баруун талын AI туслахаар дамжуулж хариулна.
              </p>
            </div>

            {attachedDocument ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#0B1F3A]/10 bg-[#F8FAFC] px-3 py-2.5 text-sm">
                <Paperclip className="size-4 shrink-0 text-[#5C6570]" />
                <span className="min-w-0 flex-1 truncate font-medium text-[#0A0F14]">
                  {attachedDocument.fileName}
                </span>
                {attachedDocument.extractStatus !== "OK" ? (
                  <span className="shrink-0 text-[11px] text-amber-700">
                    текст уншигдаагүй
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-emerald-700">
                    хавсаргасан
                  </span>
                )}
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-input",
                  uploading && "opacity-60",
                )}
              >
                <Paperclip className="size-5 text-muted-foreground" />
                <span className="text-[13px] font-medium text-[#0A0F14]">
                  {uploading
                    ? "Байршуулж байна…"
                    : "PDF файлаа чирж оруулах эсвэл дарж сонгох"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Зөвхөн жинхэнэ (скан хийгээгүй) PDF, 10MB хүртэл
                </span>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={handleInputChange}
            />
            {uploadError ? (
              <p className="text-xs text-destructive">{uploadError}</p>
            ) : null}
          </div>
        ) : null}

        {active === "ai" ? (
          <div className="flex h-full min-h-[24rem] flex-col">
            <h2 className="mb-2 text-sm font-semibold">AI туслах</h2>
            <ChatTranscript
              messages={messages}
              loading={loading}
              chatError={chatError}
              accessGateMessage={accessGate?.message}
              className="min-h-[16rem] flex-1"
            />
            <ChatComposer
              message={message}
              onChange={setMessage}
              onSubmit={handleSubmit}
              loading={loading}
            />
          </div>
        ) : null}

        {active === "research" ? (
          <NotesSection
            heading="Судалгаа"
            help="Хэргийн судалгааны тэмдэглэлээ энд бичиж болно."
            value={researchNotes}
            onChange={setResearchNotes}
            placeholder="Судалгааны эх сурвалж, эшлэл, дүгнэлт..."
          />
        ) : null}

        {active === "notes" ? (
          <NotesSection
            heading="Тэмдэглэл"
            help="Чөлөөт тэмдэглэл."
            value={freeNotes}
            onChange={setFreeNotes}
            placeholder="Тэмдэглэл бичих..."
          />
        ) : null}
      </div>

      <aside className="hidden w-72 shrink-0 flex-col border-l lg:flex">
        <div className="flex items-center gap-1.5 border-b bg-muted/30 px-3 py-2.5">
          <Sparkles className="size-3.5 text-[#0B1F3A]" />
          <p className="text-xs font-semibold">AI туслах</p>
        </div>
        <ChatTranscript
          messages={messages}
          loading={loading}
          chatError={chatError}
          accessGateMessage={accessGate?.message}
          compact
          className="min-h-0 flex-1"
        />
        <ChatComposer
          message={message}
          onChange={setMessage}
          onSubmit={handleSubmit}
          loading={loading}
          compact
        />
      </aside>
    </div>
  );
}

function ChatTranscript({
  messages,
  loading,
  chatError,
  accessGateMessage,
  compact = false,
  className,
}: {
  messages: ChatMessage[];
  loading: boolean;
  chatError: string;
  accessGateMessage?: string;
  compact?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div
      ref={ref}
      className={cn(
        "space-y-2.5 overflow-y-auto bg-[#FAFBFC] p-3",
        compact ? "text-[12px]" : "text-[13px]",
        className,
      )}
    >
      {messages.length === 0 ? (
        <p className="leading-relaxed text-[#5C6570]">
          Хэргийн талаар асуултаа энд бичээрэй — хавсаргасан PDF байвал TORE
          Legal AI түүн дээр үндэслэн хариулна.
        </p>
      ) : (
        messages.map((item, index) =>
          item.role === "USER" ? (
            <div
              key={index}
              className={cn(
                "ml-4 rounded-2xl rounded-tr-md bg-[#0B1F3A] leading-relaxed whitespace-pre-wrap text-white",
                compact ? "px-2.5 py-1.5" : "px-3 py-2",
              )}
            >
              {item.content}
            </div>
          ) : (
            <div
              key={index}
              className={cn(
                "mr-2 rounded-2xl rounded-tl-md border border-[#0B1F3A]/10 bg-white",
                compact ? "p-2.5" : "p-3",
              )}
            >
              <p className="leading-relaxed whitespace-pre-wrap text-[#0A0F14]">
                {item.content}
              </p>
            </div>
          ),
        )
      )}
      {loading ? (
        <p className="text-[11px] text-[#8A939D]">
          TORE Legal AI бичиж байна...
        </p>
      ) : null}
      {chatError ? (
        <p role="alert" className="text-[11px] text-red-600">
          {chatError}
        </p>
      ) : null}
      {accessGateMessage ? (
        <p role="alert" className="text-[11px] text-amber-700">
          {accessGateMessage}
        </p>
      ) : null}
    </div>
  );
}

function ChatComposer({
  message,
  onChange,
  onSubmit,
  loading,
  compact = false,
}: {
  message: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  compact?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="border-t border-[#0B1F3A]/8 p-2.5">
      <div className="flex items-center gap-2 rounded-xl border border-[#D9DEE5] bg-[#F8FAFC] px-2 py-1.5">
        <input
          value={message}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Асуух..."
          disabled={loading}
          className={cn(
            "min-w-0 flex-1 bg-transparent px-1 py-1.5 outline-none placeholder:text-[#9AA3AD]",
            compact ? "text-[12.5px]" : "text-sm",
          )}
        />
        <button
          type="submit"
          aria-label="Илгээх"
          disabled={!message.trim() || loading}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg bg-[#0B1F3A] text-white transition hover:bg-[#173A66] disabled:cursor-not-allowed disabled:opacity-40",
            compact ? "size-8" : "size-9",
          )}
        >
          <Send className="size-3.5" />
        </button>
      </div>
    </form>
  );
}

function NotesSection({
  heading,
  help,
  value,
  onChange,
  placeholder,
}: {
  heading: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="grid gap-2">
      <h2 className="text-sm font-semibold">{heading}</h2>
      <p className="text-xs text-muted-foreground">{help}</p>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={14}
        className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  );
}
