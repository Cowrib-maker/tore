"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Paperclip, Send, Square } from "lucide-react";

import {
  LEGAL_AI_DOCUMENT_FILE_ACCEPT,
  LEGAL_AI_NEEDS_OCR_WARNING,
} from "@/application/ai/legal-ai-document.constants";
import {
  clientRejectLegalAiDocument,
  legalAiExtractStatusHint,
} from "@/application/ai/legal-ai-document-file";
import { useThinkingStageLabel } from "@/components/legal-ai/legal-ai-thinking-stages";
import { useLegalAiChatSession } from "@/components/legal-ai/use-legal-ai-chat-session";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { cn } from "@/lib/utils";

type AttachedDocument = {
  id: string;
  fileName: string;
  extractStatus: "OK" | "EMPTY" | "FAILED" | "NEEDS_OCR";
  pageCount: number | null;
};

/**
 * One column of the lawyer workspace: a compact document drop zone (drag & drop
 * or browse) feeding straight into a TORE Legal AI conversation scoped to
 * this column.
 */
export function WorkspaceColumnPanel({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const {
    messages,
    conversationId,
    loading,
    error: chatError,
    accessGate,
    sendMessage,
    stop,
    setConversationId,
  } = useLegalAiChatSession();
  const thinkingStageLabel = useThinkingStageLabel(loading);

  const [message, setMessage] = useState("");
  const [attachedDocuments, setAttachedDocuments] = useState<AttachedDocument[]>(
    [],
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useAutoResizeTextarea(messageTextareaRef, message, 160);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function uploadFile(file: File) {
    const rejected = clientRejectLegalAiDocument(file);
    if (rejected) {
      setUploadError(rejected);
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

      const documentId = data.id;
      const documentFileName = data.fileName;
      const extractStatus = data.extractStatus ?? "OK";
      setConversationId(data.conversationId);
      setAttachedDocuments((current) => [
        ...current,
        {
          id: documentId,
          fileName: documentFileName,
          extractStatus,
          pageCount: data.pageCount ?? null,
        },
      ]);
      if (extractStatus === "NEEDS_OCR") {
        setUploadError(LEGAL_AI_NEEDS_OCR_WARNING);
      }
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
    const result = await sendMessage(text, "PROFESSIONAL");
    // Composer's attachment strip is a "about to send" tray, not a running
    // list — clear it once the turn lands. The document stays attached to
    // the conversation server-side either way.
    if (result === "ok") {
      setAttachedDocuments([]);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-white">
      <div className="border-b bg-muted/30 px-3 py-2.5">
        <p className="text-sm font-semibold">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      <div className="border-b p-2.5">
        {attachedDocuments.length ? (
          <div className="mb-2 space-y-1.5">
            {attachedDocuments.map((document) => {
              const hint = legalAiExtractStatusHint(document.extractStatus);
              return (
                <div
                  key={document.id}
                  className="flex items-center gap-2 rounded-lg border border-[#0B1F3A]/10 bg-[#F8FAFC] px-2.5 py-2 text-xs"
                >
                  <Paperclip className="size-3.5 shrink-0 text-[#5C6570]" />
                  <span className="min-w-0 flex-1 truncate font-medium text-[#0A0F14]">
                    {document.fileName}
                  </span>
                  {hint ? (
                    <span className="shrink-0 text-[10px] text-amber-700">
                      {hint}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-4 text-center transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-input",
            uploading && "opacity-60",
          )}
        >
          <Paperclip className="size-4 text-muted-foreground" />
          <span className="text-[11px] font-medium text-[#0A0F14]">
            {uploading ? "Байршуулж байна…" : "Файл чирж оруулах эсвэл сонгох"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            PDF, DOCX, JPG, PNG, WEBP · 10MB хүртэл
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={LEGAL_AI_DOCUMENT_FILE_ACCEPT}
          className="sr-only"
          onChange={handleInputChange}
        />
        {uploadError ? (
          <p className="mt-1.5 text-[11px] text-destructive">{uploadError}</p>
        ) : null}
      </div>

      <div
        ref={transcriptRef}
        className="min-h-[8rem] flex-1 space-y-3 overflow-y-auto bg-[#FAFBFC] p-3"
      >
        {messages.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-[#5C6570]">
            Хэргийн талаар асуултаа энд бичээрэй — хавсаргасан баримт байвал
            TORE Legal AI түүн дээр үндэслэн хариулна.
          </p>
        ) : (
          messages.map((item, index) =>
            item.role === "USER" ? (
              <div
                key={index}
                className="ml-4 rounded-2xl rounded-tr-md bg-[#0B1F3A] px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap text-white"
              >
                {item.content}
              </div>
            ) : (
              <div
                key={index}
                className="mr-2 rounded-2xl rounded-tl-md border border-[#0B1F3A]/10 bg-white p-3"
              >
                <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#0A0F14]">
                  {item.content}
                </p>
              </div>
            ),
          )
        )}
        {loading ? (
          <p className="text-[11px] text-[#8A939D]">{thinkingStageLabel}</p>
        ) : null}
        {chatError ? (
          <p role="alert" className="text-[11px] text-red-600">
            {chatError}
          </p>
        ) : null}
        {accessGate ? (
          <p role="alert" className="text-[11px] text-amber-700">
            {accessGate.message}
          </p>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[#0B1F3A]/8 p-2.5">
        <div className="flex items-end gap-2 rounded-xl border border-[#D9DEE5] bg-[#F8FAFC] px-2 py-1.5">
          <textarea
            ref={messageTextareaRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Асуух..."
            rows={1}
            disabled={loading}
            className="min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-[13px] leading-5 outline-none placeholder:text-[#9AA3AD]"
          />
          {loading ? (
            <button
              type="button"
              aria-label="Зогсоох"
              onClick={stop}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0B1F3A] text-white transition hover:bg-[#173A66]"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Илгээх"
              disabled={!message.trim() || loading}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0B1F3A] text-white transition hover:bg-[#173A66] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="size-3.5" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
