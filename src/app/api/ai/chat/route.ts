import { NextResponse } from "next/server";
import OpenAI from "openai";

import { auth } from "@/lib/auth";
import { prisma } from "@/infrastructure/database/prisma";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ChatRequest = {
  message?: string;
  conversationId?: string;
};

export async function POST(request: Request) {
  try {
    // 1. User must be authenticated
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Нэвтэрч орно уу." },
        { status: 401 },
      );
    }

    // 2. Validate request body
    const body = (await request.json()) as ChatRequest;
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json(
        { error: "Асуултаа оруулна уу." },
        { status: 400 },
      );
    }

    // 3. Check API key
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured.");

      return NextResponse.json(
        { error: "AI үйлчилгээний тохиргоо хийгдээгүй байна." },
        { status: 500 },
      );
    }

    // 4. Find or create conversation
    let conversation;

    if (body.conversationId) {
      conversation = await prisma.aIConversation.findFirst({
        where: {
          id: body.conversationId,
          userId: session.user.id,
        },
      });

      if (!conversation) {
        return NextResponse.json(
          { error: "Яриа олдсонгүй." },
          { status: 404 },
        );
      }
    } else {
      conversation = await prisma.aIConversation.create({
        data: {
          userId: session.user.id,
          title: message.slice(0, 80),
        },
      });
    }

    // 5. Save user's message
    await prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: message,
      },
    });

    // 6. Load conversation history
    const history = await prisma.aIMessage.findMany({
      where: {
        conversationId: conversation.id,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 30,
    });

    // 7. Build OpenAI messages
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `
Та бол TORE Legal AI-ийн анхны хувилбар.

Та Монгол Улсын иргэн, хуулийн этгээдэд хууль зүйн мэдээлэл,
асуудлаа тодорхойлоход туслах AI туслах юм.

Үндсэн зарчим:
- Хэрэглэгчийн асуудлыг эхлээд ойлгож, ангилна.
- Хууль зүйн мэдээллийг ойлгомжтой Монгол хэлээр өгнө.
- Хэрэглэгчийн өгсөн баримт, нөхцөлд тулгуурлана.
- Тодорхойгүй зүйл байвал таамаглан зохиохгүй, нэмэлт мэдээлэл асууна.
- Эцсийн хууль зүйн шийдвэрийг AI өөрөө гаргаж байгаа мэт ойлголт төрүүлэхгүй.
- Боломжтой тохиолдолд өмгөөлөгч/хуульчийн мэргэжлийн зөвлөгөө авах шаардлагатайг тайлбарлана.
- Одоогоор энэ нь TORE Legal AI-ийн foundation хувилбар тул баталгаатай эх сурвалжийн систем,
Монгол Улсын хууль тогтоомжийн нарийн retrieval систем дараагийн шатанд нэмэгдэнэ.

Хэрэглэгчийн асуултад шууд, хэрэгтэй байдлаар хариул.
        `.trim(),
      },
      ...history.map((item) => ({
        role: item.role.toLowerCase() as "user" | "assistant" | "system",
        content: item.content,
      })),
    ];

    // 8. Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      messages,
    });

    const answer =
      completion.choices[0]?.message?.content?.trim() ??
      "Хариу боловсруулах явцад алдаа гарлаа.";

    // 9. Save AI response
    const assistantMessage = await prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: answer,
        provider: "OPENAI",
        model: completion.model,
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
    });

    // 10. Save usage information
    await prisma.aIUsage.create({
      data: {
        userId: session.user.id,
        provider: "OPENAI",
        model: completion.model,
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      message: {
        id: assistantMessage.id,
        role: "ASSISTANT",
        content: answer,
      },
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
    });
  } catch (error) {
    console.error("TORE Legal AI error:", error);

    return NextResponse.json(
      {
        error: "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
      },
      { status: 500 },
    );
  }
}