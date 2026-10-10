/**
 * Honest implementation status of each TORE product, shown on /admin/preview/coverage.
 * Facts here were read from the repository (see the `evidence` paths); they are NOT inferred or invented.
 * A product with no real checkout gets NO simulated checkout — a fabricated one would misrepresent the product.
 */
export type ProductCoverage = {
  id: "citizen" | "student" | "lawyer" | "firm" | "team" | "spell";
  name: string;
  checkout: "simulated" | "read-only" | "missing" | "other-branch";
  /** Preview route that works today, if any. */
  previewHref: string | null;
  summary: string;
  evidence: string[];
  gaps: string[];
};

export const PRODUCT_COVERAGE: readonly ProductCoverage[] = [
  {
    id: "citizen",
    name: "TORE Citizen",
    checkout: "simulated",
    previewHref: "/admin/preview/checkout/citizen",
    summary: "Бодит Billing Center (багц сонгох → төлбөрийн арга → нэхэмжлэл → төлөв) симуляци хийгдэнэ. Үнэ, квот каталогоос уншигдана.",
    evidence: ["src/components/billing/billing-center.tsx", "src/domain/constants/subscription-plans.ts (CITIZEN_BASIC, CITIZEN_PLUS)"],
    gaps: [
      "Бодит checkout-д тусдаа захиалгын нэгтгэл/маягт/баталгаажуулалт, купон байхгүй: багц карт → төлбөрийн арга → нэхэмжлэл.",
      "QPay-ийн QR/deeplink-ийг симуляцид үзүүлэхгүй (бодит QPay-тэй төстэй зураг үүсгэхгүй); QR ба банк шилжүүлгийн урсгал харагдана.",
    ],
  },
  {
    id: "lawyer",
    name: "TORE Lawyer",
    checkout: "simulated",
    previewHref: "/admin/preview/checkout/lawyer",
    summary: "Бодит Billing Center (SOLO багц) симуляци хийгдэнэ.",
    evidence: ["src/components/billing/billing-center.tsx", "src/domain/constants/subscription-plans.ts (SOLO_PLAN)"],
    gaps: ["Сунгалт/шинэчлэлтийн тусдаа дэлгэц байхгүй: хугацаа дууссан үед ижил багц сонгох дэлгэц гарна."],
  },
  {
    id: "team",
    name: "TORE Team",
    checkout: "missing",
    previewHref: null,
    summary: "Каталогт TEAM багц байгаа ч үнэ 0₮ ба «Product UI is not implemented». Төлбөр хийх дэлгэц байхгүй.",
    evidence: ["src/domain/constants/subscription-plans.ts (TEAM_PLAN, priceMnt: 0)", "src/app/organizations/[organizationId]/page.tsx (байгууллагын ажлын талбар, «удахгүй» модулиуд)"],
    gaps: ["Баг/байгууллагын багц, суудлын төлбөр, багийн админ/гишүүний checkout хэрэгжээгүй.", "Байгууллагын «Billing» холбоос нь хэрэглэгчийн хувийн /billing руу очдог."],
  },
  {
    id: "firm",
    name: "TORE Firm",
    checkout: "missing",
    previewHref: null,
    summary: "LAW_FIRM байгууллагын төрөл ба ажлын талбар (/organizations) байгаа; Firm-ийн тусдаа багц, үнэ, checkout байхгүй.",
    evidence: ["src/domain/enums/index.ts (TenantKind / LAW_FIRM)", "src/app/organizations/[organizationId]/page.tsx"],
    gaps: ["Firm багц/үнэ/checkout, firm админы төлбөрийн дэлгэц хэрэгжээгүй."],
  },
  {
    id: "student",
    name: "TORE Student",
    checkout: "missing",
    previewHref: "/admin/preview/student?context=anonymous",
    summary: "«Оюутан» хэрэглэгчийн эрх (UserRole) байхгүй. /student нь нийтийн танилцуулга хуудас; багц/checkout байхгүй.",
    evidence: ["src/domain/enums/index.ts (UserRole: CLIENT, LAWYER, ADMIN)", "src/app/student/page.tsx"],
    gaps: ["Оюутны эрх, оюутны үнэ/хөнгөлөлт, checkout хэрэгжээгүй."],
  },
  {
    id: "spell",
    name: "TORE Spell",
    checkout: "other-branch",
    previewHref: null,
    summary: "Spell нь `main` дээр байхгүй; зөвхөн тусдаа салбар (claude/tore-spell-foundation-lv0j6l)-д байна. Тэр салбарыг нэгтгээгүй, өөрчлөөгүй.",
    evidence: ["main дээр src/app/spell, src/app/api/spell, desktop/ байхгүй", "docs/admin/spell-surface/ (Spell нэгтгэгдсэний дараа хэрэглэх patch багц)"],
    gaps: ["Spell-ийн худалдан авалтын (spell-purchase) дэлгэцийг Spell салбар `main`-д орсны дараа энэ хэсэгт нэмнэ."],
  },
];
