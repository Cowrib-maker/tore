"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import {
  clientRejectMatterDocument,
  MATTER_DOCUMENT_CLIENT_TIMEOUT_MS,
  MATTER_DOCUMENT_FILE_ACCEPT,
  MATTER_DOCUMENT_SUPPORTED_HINT,
} from "@/application/use-cases/matters/matter-document-policy";
import { Button } from "@/components/ui/button";
import {
  readUploadResponse,
  UPLOAD_GENERIC_ERROR,
} from "@/lib/read-upload-response";

type Props = {
  matterId: string;
};

const CLIENT_TIMEOUT_MESSAGE =
  "Хариу удаан ирж байна. Холболтоо шалгаад дахин оролдоно уу.";

/** Server codes where picking the same file again cannot succeed. */
const NON_RETRYABLE_CODES = new Set([
  "FILE_TOO_LARGE",
  "UNSUPPORTED_FILE_TYPE",
  "OCR_UNSUPPORTED",
  "DOCUMENT_EXTRACTION_FAILED",
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "NOT_FOUND",
]);

export function MatterDocumentUpload({ matterId }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [retryFile, setRetryFile] = useState<File | null>(null);

  async function upload(file: File) {
    setError("");
    setRetryFile(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/matters/${matterId}/documents`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(MATTER_DOCUMENT_CLIENT_TIMEOUT_MS),
      });
      const result = await readUploadResponse<{ error?: string; code?: string }>(
        response,
      );
      if (!result.ok) {
        setError(result.errorMessage ?? UPLOAD_GENERIC_ERROR);
        const code = result.data?.code;
        if (response.status >= 500 && !(code && NON_RETRYABLE_CODES.has(code))) {
          setRetryFile(file);
        }
        return;
      }
      router.refresh();
    } catch (caught) {
      const timedOut =
        caught instanceof DOMException &&
        (caught.name === "TimeoutError" || caught.name === "AbortError");
      setError(timedOut ? CLIENT_TIMEOUT_MESSAGE : UPLOAD_GENERIC_ERROR);
      setRetryFile(file);
    } finally {
      setUploading(false);
    }
  }

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const rejected = clientRejectMatterDocument(file);
    if (rejected) {
      setError(rejected);
      setRetryFile(null);
      return;
    }

    await upload(file);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={MATTER_DOCUMENT_FILE_ACCEPT}
        className="hidden"
        onChange={handleChange}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Хавсаргаж байна…" : "Баримт хавсаргах"}
        </Button>
        {retryFile && !uploading ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void upload(retryFile)}
          >
            Дахин оролдох
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {MATTER_DOCUMENT_SUPPORTED_HINT}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
