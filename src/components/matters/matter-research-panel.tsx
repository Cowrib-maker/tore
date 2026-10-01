"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import type { LegalAiSafeCitation } from "@/application/ai/legal-ai-citation";
import { LegalAiCitationList } from "@/components/legal-ai/legal-ai-citation-list";
import { Button } from "@/components/ui/button";
import { NativeTextarea } from "@/components/ui/native-select";

type Props = {
  matterId: string;
};

type ResearchResult = {
  conversationId: string;
  content: string;
  citations: LegalAiSafeCitation[];
};

export function MatterResearchPanel({ matterId }: Props) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) {
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/matters/${matterId}/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error || "Судалгаа хийхэд алдаа гарлаа.");
        return;
      }
      setResult({
        conversationId: body.conversationId,
        content: body.content,
        citations: body.citations ?? [],
      });
    } catch {
      setError("Судалгаа хийхэд алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Энэ хэрэгт хамаарах хуулийг судлуулж, эх сурвалжтай дүгнэлт авах.
      </p>
      <form onSubmit={handleSubmit} className="space-y-2">
        <NativeTextarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Судалгааны асуултаа бичнэ үү"
          disabled={loading}
        />
        <Button type="submit" size="sm" disabled={loading || !question.trim()}>
          {loading ? "Судалж байна…" : "Судлуулах →"}
        </Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {result ? (
        <div className="space-y-3 rounded-xl border border-[#0B1F3A]/8 bg-[#FAFAF8] p-4">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A6B2A]">
            Судалгааны дүгнэлт
          </p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-[#3D4A57]">
            {result.content}
          </p>
          <LegalAiCitationList citations={result.citations} />
          <Link
            href={`/matters/${matterId}/ai?conversationId=${result.conversationId}`}
            className="inline-block text-sm text-[#173A66] underline underline-offset-2 hover:text-[#0B1F3A]"
          >
            Бүтэн ярианд үзэх →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
