export type LegalAiAccessGate = {
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
