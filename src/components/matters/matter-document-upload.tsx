"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import {
  clientRejectLegalAiDocument,
} from "@/application/ai/legal-ai-document-file";
import { LEGAL_AI_DOCUMENT_FILE_ACCEPT } from "@/application/ai/legal-ai-document.constants";
import { Button } from "@/components/ui/button";

type Props = {
  matterId: string;
};

export function MatterDocumentUpload({ matterId }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
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
      const response = await fetch(`/api/matters/${matterId}/documents`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error || "Баримт хавсаргахад алдаа гарлаа.");
        return;
      }
      router.refresh();
    } catch {
      setError("Баримт хавсаргахад алдаа гарлаа.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={LEGAL_AI_DOCUMENT_FILE_ACCEPT}
        className="hidden"
        onChange={handleChange}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Хавсаргаж байна…" : "Баримт хавсаргах"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
