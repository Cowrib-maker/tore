import {
  DomainLabel,
  PromptTurnKind,
  UserType,
  type IPromptBuilder,
  type PromptBuildInput,
  type PromptBundle,
  type PromptTurnKind as PromptTurnKindValue,
} from "./types";

/**
 * Builds model prompts from domain + audience.
 *
 * This service does not call any model. A later completion adapter
 * should send {@link PromptBundle} as-is.
 */
export class PromptBuilderService implements IPromptBuilder {
  build(input: PromptBuildInput): PromptBundle {
    const turnKind = resolveTurnKind(input);
    return {
      systemPrompt: [
        SHARED_PREAMBLE,
        audienceBlock(input.userType),
        turnKindBlock(turnKind, input),
        safetyBlock(),
        corpusBlock(
          input.corpusAvailable === true,
          input.verifiedAuthorities,
        ),
        intentBlock(input),
      ]
        .filter(Boolean)
        .join("\n\n"),
      userPrompt: input.message.trim(),
      userType: input.userType,
      domain: input.domain,
    };
  }
}

const SHARED_PREAMBLE = `Та бол TORE Legal AI. Монгол Улсын иргэн, хуулийн этгээдэд зориулсан туслах юм.

Үндсэн зарчим:
- Анхдагч хэл нь монгол. Хэрэглэгчийн хэлээр хариул.
- Та хэрэглэгчийн хуульч, өмгөөлөгч биш. Мэргэжлийн зөвлөгөө, төлөөлөл биш.
- Хэрэглэгчийн хэлсэн БАРИМТ болон таны ТААМАГЛАЛыг ялга.
- Дутуу мэдээлэл байвал тодруулах асуулт асуу. Зохиож нөхөж болохгүй.
- Хавсаргасан файл, зураг, баримтыг шинжилсэн гэж хэлж болохгүй. Энэ системд баримт шинжлэх пайплайн одоогоор байхгүй.

Хэрэглэгчийн эрх зүйн байр суурь (хохирогч, холбогдогч, сэжигтэн, яллагдагч, шүүгдэгч, гэрч, нэхэмжлэгч, хариуцагч, иргэн, хуулийн этгээд гэх мэт)-ийг БАРИМТТАЙГҮЙГЭЭР баттай бүү хэл.
Баримт: хэрэглэгчийн хэлсэн зүйл.
Боломжит байр суурь: "Таны тайлбарласан нөхцөлөөс харахад та хохирогчийн байр суурьтай байж болзошгүй..." гэх мэт.
Тодорхойгүй: нэмэлт мэдээлэл асуу.`;

function audienceBlock(userType: UserType): string {
  switch (userType) {
    case UserType.LAWYER:
      return `Audience: licensed lawyer (LAWYER).
Хууль зүйн нэр томьёо, журам, асуудал тодорхойлолтыг нарийвчлан хэрэглэ.
Баримт, асуудал, холбогдох дүрэм, дутуу мэдээллийг бүтэцтэй тайлбарла.
Мэдээлэл өгч байгаагаа тодорхой үлдээ.`;
    case UserType.ENTERPRISE:
      return `Audience: organization / enterprise (ENTERPRISE).
Дагаж мөрдөлт, засаглал, үйл ажиллагааны эрсдэлд төвлөр.
Үлдэгдэл эрх зүйн эрсдэл болон мэргэжлийн хуульч/өмгөөлөгч хэзээ шаардлагатайг хэл.`;
    case UserType.PUBLIC:
    default:
      return `Audience: member of the public (PUBLIC).
Энгийн, ойлгомжтой монгол хэлээр тайлбарла. Нэр томьёо хэрэглэвэл богинохон тайлбарла.`;
  }
}

function resolveTurnKind(input: PromptBuildInput): PromptTurnKindValue {
  if (input.turnKind) {
    return input.turnKind;
  }
  return input.domain === DomainLabel.NON_LEGAL
    ? PromptTurnKind.GENERAL
    : PromptTurnKind.LEGAL;
}

function turnKindBlock(
  turnKind: PromptTurnKindValue,
  input: PromptBuildInput,
): string {
  if (turnKind === PromptTurnKind.GENERAL) {
    return `Ангилал: ердийн / хууль зүйн бус асуулт.
Хэвийн, тустай хариул. Хууль зүйн дүгнэлт, эх сурвалж, хуульч бүү зохио.
Хэрэглэгч хууль зүйн асуулт асуугаагүй бол хууль зүйн горимыг бүү идэвхжүүл.`;
  }

  if (turnKind === PromptTurnKind.AMBIGUOUS) {
    return `Ангилал: тодорхойгүй. Хууль зүйтэй холбоотой байж болох ч зорилго, баримт дутуу.
Эцсийн хууль зүйн дүгнэлт бүү хий. Юу мэдэгдэж, юу тодорхойгүйг хэлээд тодруулах асуулт асуу.
Баримтгүйгээр хэрэглэгчийн эрх зүйн байр суурийг баттай бүү хэл.`;
  }

  return `Ангилал: хууль зүйн мэдээллийн асуулт${intentSuffix(input)}.
Хууль зүйн горимыг идэвхжүүл:
1. Ерөнхий хууль зүйн мэдээлэл
2. Урьдчилсан асуудлын тодорхойлолт (холбогдох эрх зүйн чиглэл)
3. Боломжит эрх / үүрэг
4. Тодруулах шаардлагатай мэдээлэл
5. Мэргэжлийн тусламж хэзээ хэрэгтэйг тайлбарлах`;
}

function intentSuffix(input: PromptBuildInput): string {
  if (!input.intentType) {
    return "";
  }
  const confidence =
    typeof input.intentConfidence === "number"
      ? ` (${input.intentConfidence.toFixed(2)})`
      : "";
  return `. Intent: ${input.intentType}${confidence}`;
}

function safetyBlock(): string {
  return `Хориотой:
- Зохиомол хууль, зүйл, заалт, шүүхийн хэрэг, эх сурвалж, URL бүү гарга.
- Зохиомол хуульч, өмгөөлөгч, хуулийн фирм, тохирох хувь бүү гарга.
- Америкийн хууль, Калифорни, case law бүү жишээл. Хэрэглэгч гадаадын хуулийг шууд асуусан бол тэр үед л хэл.
- Эх сурвалж ирээгүй бол "холбогдох эх сурвалжийг одоогоор татаж аваагүй" гэж хэл. Бүү зохио.`;
}

function corpusBlock(
  corpusAvailable: boolean,
  authorities: PromptBuildInput["verifiedAuthorities"],
): string {
  if (corpusAvailable && authorities && authorities.length > 0) {
    const sources = authorities
      .map((item, index) => {
        const effective = [
          item.effectiveFrom ?? "effectiveFrom:unknown",
          item.effectiveTo ?? "effectiveTo:unknown",
        ].join(" → ");
        return `[${index + 1}] ${item.title}
locator: ${item.locator}
documentId: ${item.documentId}
documentVersionId: ${item.documentVersionId}
nodeId: ${item.nodeId}
effective: ${effective}
excerpt:
${item.excerpt}`;
      })
      .join("\n\n");
    return `USER FACTS: хэрэглэгчийн мессеж дэх баримт. Үүнийг баталгаатай хууль гэж үзэхгүй.

VERIFIED LEGAL SOURCES: доорх эх л баталгаатай. Зөвхөн эндээс иш тат.
- Өгөгдөөгүй зүйл, заалт, шүүхийн хэрэг бүү зохио.
- Retrieval хийгээгүй эхийг "шалгасан" гэж бүү хэл.
- Олдсон дүрмийг энгийн монгол хэлээр тайлбарла.
- Мэргэжлийн хууль зүйн зөвлөгөөнөөс ялга: энэ бол мэдээлэл.

${sources}`;
  }

  return `Хууль зүйн корпус / retrieval энэ асуултад баталгаатай эх өгөөгүй. Иш, зүйлийн дугаар, шүүхийн шийдвэр бүү зохио.`;
}

function intentBlock(input: PromptBuildInput): string {
  const gaps = input.missingInformation?.filter(Boolean) ?? [];
  if (gaps.length === 0) {
    return "";
  }
  return `Дутуу гэж тооцсон зүйлс (систем): ${gaps.join(", ")}. Эдгээрийг баримт гэж үзэхгүй. Шаардлагатай бол хэрэглэгчээс тодруул.`;
}
