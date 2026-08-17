import { NextResponse } from "next/server";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { getLegalAiService } from "@/application/ai/create-legal-ai-service";
import { auth } from "@/lib/auth";

type ChatRequest = {
  message?: string;
  conversationId?: string;
};

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Нэвтэрч орно уу." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as ChatRequest;
    const result = await getLegalAiService().createTurn({
      userId: session.user.id,
      message: body.message ?? "",
      conversationId: body.conversationId,
      userContext: {
        role: session.user.role,
      },
    });

    return NextResponse.json({
      conversationId: result.conversationId,
      message: {
        id: result.message.id,
        role: result.message.role,
        content: result.message.content,
      },
      usage: result.usage,
    });
  } catch (error) {
    if (error instanceof LegalAiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }

    console.error("TORE Legal AI error:", error);

    return NextResponse.json(
      {
        error: "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
      },
      { status: 500 },
    );
  }
}
