import type { LegalAiCheckoutView } from "@/components/legal-ai/legal-ai-checkout";

export type LegalAiAccessGate = {
  kind: "auth" | "billing";
  question: string;
  message: string;
  checkout?: LegalAiCheckoutView | null;
  checkoutError?: string;
  /** Defaults to "citizen" when absent — only the lawyer workspace ever sets "lawyer". */
  audience?: "citizen" | "lawyer";
};

export type LegalAiChatHttpResult =
  | { type: "auth"; gate: LegalAiAccessGate }
  | { type: "billing"; gate: LegalAiAccessGate }
  | { type: "error"; message: string }
  | {
      type: "ok";
      conversationId?: string;
      content: string;
      citations: unknown;
    };

export function interpretLegalAiChatAccess(input: {
  status: number;
  body: {
    error?: string;
    conversationId?: string;
    message?: { content?: string; citations?: unknown };
  };
  question: string;
  audience?: "citizen" | "lawyer";
}): LegalAiChatHttpResult {
  if (input.status === 401) {
    return {
      type: "auth",
      gate: {
        kind: "auth",
        question: input.question,
        message:
          input.body.error ??
          "Үнэгүй хууль зүйн асуултынхаа хариуг авсан тул нэвтэрнэ үү.",
        audience: input.audience,
      },
    };
  }

  if (input.status === 402) {
    return {
      type: "billing",
      gate: {
        kind: "billing",
        question: input.question,
        message:
          input.body.error ??
          "Шинэ хууль зүйн асуултад төлбөртэй багц хэрэгтэй.",
        audience: input.audience,
      },
    };
  }

  if (input.status < 200 || input.status >= 300) {
    return {
      type: "error",
      message: input.body.error ?? "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
    };
  }

  return {
    type: "ok",
    conversationId: input.body.conversationId,
    content: input.body.message?.content ?? "",
    citations: input.body.message?.citations,
  };
}
