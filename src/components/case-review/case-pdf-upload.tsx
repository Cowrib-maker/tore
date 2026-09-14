"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { LEGAL_AI_DOCUMENT_MAX_BYTES } from "@/application/ai/legal-ai-document.constants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  caseId: string;
  expectedVersion: number;
};

/**
 * PDF or photo (JPEG/PNG/WEBP). The `accept` attribute is the actual
 * mobile-camera fix: `accept="application/pdf"` alone makes iOS/Android
 * native file pickers hide the Camera/Photos options entirely, so a
 * lawyer could not attach a photo of a document from their phone at all.
 * Listing image MIME types here restores those options in the OS
 * picker — deliberately no `capture` attribute, so the picker still
 * offers BOTH "choose from gallery" and "take photo" rather than forcing
 * the camera to launch directly.
 */
const ACCEPTED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const ACCEPTED_FILE_ACCEPT = ACCEPTED_MIME_TYPES.join(",");

export function CasePdfUpload({ caseId, expectedVersion }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await upload(file);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  async function upload(file: File) {
    setError("");
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setError("Зөвхөн PDF эсвэл зураг (JPEG, PNG, WEBP) хавсаргана уу.");
      return;
    }
    if (file.size > LEGAL_AI_DOCUMENT_MAX_BYTES) {
      setError("Файл 10MB-аас ихгүй байх ёстой.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("caseId", caseId);
      formData.append("expectedVersion", String(expectedVersion));
      const response = await fetch("/api/lawyer/case-review/documents", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Баримт хавсаргахад алдаа гарлаа.");
      }
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Баримт хавсаргахад алдаа гарлаа.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label
        className={cn(
          "inline-flex h-9 cursor-pointer items-center rounded-lg border border-[#0B1F3A]/14 bg-white px-3 text-sm font-medium text-[#0B1F3A]",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        {uploading ? "Хуулж байна…" : "Файл хавсаргах"}
        <input
          type="file"
          accept={ACCEPTED_FILE_ACCEPT}
          className="sr-only"
          disabled={uploading}
          onChange={onFile}
        />
      </label>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-[#5C6570]">PDF эсвэл зураг (камераар авсан ч болно). 10MB хүртэл.</p>
      )}
      <Button type="submit" className="hidden" disabled>
        Хуулах
      </Button>
    </form>
  );
}
