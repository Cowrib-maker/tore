import {
  LegalIssueFamily,
  type LegalIssueFamily as IssueFamily,
} from "./legal-relevance.types";

/**
 * Stable phrase used to detect a prior clarification turn from history.
 * User-facing and jargon-free.
 */
export const LEGAL_CLARIFICATION_PREFIX =
  "Таны хэлсэн нөхцөл байдал хууль зүйн асуудал байж болзошгүй.";

const QUESTIONS: Record<IssueFamily, string> = {
  [LegalIssueFamily.CRIMINAL]:
    "Таны эд зүйл, бие, эсвэл аюулгүй байдалд халдсан тухай ярьж байна уу? Одоо юу хийх ёстойгоо мэдэхийг хүсэж байна уу?",
  [LegalIssueFamily.CIVIL]:
    "Танд мөнгө, эд зүйл, эсвэл хохиролтой холбоотой асуудал гарсан тухай асууж байна уу?",
  [LegalIssueFamily.FAMILY]:
    "Хүүхэд, гэр бүл, эсвэл хамтран амьдрагчтай холбоотой яах ёстойгоо асууж байна уу?",
  [LegalIssueFamily.EMPLOYMENT]:
    "Таныг ажлаас гаргасантай холбоотой эрх, үүргийн талаар асууж байна уу, эсвэл өөр асуудал байна уу?",
  [LegalIssueFamily.ADMINISTRATIVE]:
    "Төрийн байгууллагатай холбоотой шийдвэр, торгууль, бүртгэлийн талаар асууж байна уу?",
  [LegalIssueFamily.CONTRACT]:
    "Тохиролцоо, амлалт, эсвэл бичгэн хэлэлцээрээ биелүүлэхгүй байгаа тухай асууж байна уу?",
  [LegalIssueFamily.CORPORATE]:
    "Компани байгуулах, бүртгэл, эсвэл түншүүдийн хоорондын асуудлын талаар асууж байна уу?",
  [LegalIssueFamily.PROPERTY]:
    "Байр, газар, түрээс, эсвэл эзэмшилтэй холбоотой асуудлын талаар асууж байна уу?",
  [LegalIssueFamily.INHERITANCE]:
    "Хэн нэгэн нас барсны дараах өв, хуваарилалттай холбоотой асууж байна уу?",
  [LegalIssueFamily.TAX]:
    "Татвар төлөлт, торгууль, эсвэл татварын байгууллагатай холбоотой асууж байна уу?",
  [LegalIssueFamily.CONSUMER]:
    "Авсан бараа, үйлчилгээ, эсвэл мөнгөө буцааж авахад холбоотой асууж байна уу?",
  [LegalIssueFamily.INTELLECTUAL_PROPERTY]:
    "Бусдын бүтээл, нэр, тэмдгийг хуулбарласан эсвэл таныхийг хуулбарласан тухай асууж байна уу?",
  [LegalIssueFamily.LICENSING]:
    "Тусгай зөвшөөрөл, лицензтэй холбоотой асуудлын талаар асууж байна уу?",
  [LegalIssueFamily.REGULATORY]:
    "Дүрэм, хяналт, зөвшөөрлийн шаардлагатай холбоотой асууж байна уу?",
  [LegalIssueFamily.TRAFFIC]:
    "Замын осол, жолооны эрх, эсвэл торгуультай холбоотой асууж байна уу?",
  [LegalIssueFamily.OTHER]:
    "Юу болсныг өөрийнхөөрөө жаахан тодруулаад өгөөч. Би түүн дээр тулгуурлаад хууль зүйн тал байгаа эсэхийг ойлгохыг хичээе.",
};

export function buildClarificationMessage(family?: IssueFamily): string {
  const question = QUESTIONS[family ?? LegalIssueFamily.OTHER];
  return `${LEGAL_CLARIFICATION_PREFIX} ${question}`;
}

export function isLegalClarificationMessage(content: string): boolean {
  return content.includes(LEGAL_CLARIFICATION_PREFIX);
}

const FORBIDDEN_CLARIFICATION_SNIPPETS = [
  "ямар хууль",
  "хуулийн салбар",
  "иргэний үү",
  "эрүүгийн үү",
  "хуулийн нэр томьёо",
  "ямар хуулийн салбар",
] as const;

export function clarificationContainsForbiddenJargon(message: string): boolean {
  const lower = message.toLowerCase();
  return FORBIDDEN_CLARIFICATION_SNIPPETS.some((snippet) =>
    lower.includes(snippet),
  );
}
