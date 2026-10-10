/**
 * Registry of public text that administrators may edit without a code change.
 *
 * Only keys listed here can be stored, published or rendered as overrides. Everything else in the dictionaries stays code-owned.
 * Deliberately NOT editable here: prices, billing calculations, payment/licence/entitlement rules, authorization decisions,
 * security-sensitive system messages, and legal text (terms, privacy, billing policy) — those need their own versioned,
 * reviewed flow. `kind` marks an entry as plain editorial copy; a "legal" kind is reserved and refused by the registry guard below.
 */
export const SITE_CONTENT_LOCALES = ["mn", "en"] as const;
export type SiteContentLocale = (typeof SITE_CONTENT_LOCALES)[number];

export const SITE_CONTENT_SOURCE_LOCALE: SiteContentLocale = "mn";

export type SiteContentPageId = "home" | "shared" | "spell";

export type SiteContentPage = {
  id: SiteContentPageId;
  title: { mn: string; en: string };
  /** Public route this text appears on (for the editor's "where is this?" line). */
  route: string;
  /** Admin preview page that renders it, or null when no safe preview exists. */
  previewPage: "home" | "spell" | null;
};

export const SITE_CONTENT_PAGES: readonly SiteContentPage[] = [
  { id: "home", title: { mn: "Нүүр хуудас", en: "Homepage" }, route: "/", previewPage: "home" },
  { id: "shared", title: { mn: "Нийтлэг: цэс, хөл, хайлтын гарчиг", en: "Shared: navigation, footer, page title" }, route: "/ (болон бусад нийтийн хуудас)", previewPage: "home" },
  { id: "spell", title: { mn: "TORE Spell бүтээгдэхүүний хуудас", en: "TORE Spell product page" }, route: "/spell", previewPage: "spell" },
];

export type SiteContentSectionId =
  | "hero" | "legalAi" | "intro" | "products" | "marketplace" | "faq" | "intelligence" | "feedback"
  | "nav" | "footer" | "meta"
  | "spellHero" | "spellFeatures" | "spellDownload" | "spellSteps";

export const SITE_CONTENT_SECTION_LABELS: Record<SiteContentSectionId, { mn: string; en: string }> = {
  hero: { mn: "Толгой хэсэг", en: "Hero" },
  legalAi: { mn: "Legal AI чат — танилцуулга", en: "Legal AI chat — introduction" },
  intro: { mn: "Танилцуулга", en: "Introduction" },
  products: { mn: "Бүтээгдэхүүн, CTA", en: "Products and calls to action" },
  marketplace: { mn: "Хуульчийн зах зээл", en: "Lawyer marketplace" },
  faq: { mn: "Түгээмэл асуулт (FAQ)", en: "FAQ" },
  intelligence: { mn: "Хууль зүйн мэдээлэл", en: "Legal intelligence" },
  feedback: { mn: "Санал хүсэлт, тусламж", en: "Feedback and support" },
  nav: { mn: "Дээд цэс", en: "Navigation" },
  footer: { mn: "Хөл хэсэг", en: "Footer" },
  meta: { mn: "Хөтчийн гарчиг, хайлтын тайлбар", en: "Browser title and search description" },
  spellHero: { mn: "Толгой хэсэг", en: "Hero" },
  spellFeatures: { mn: "Боломжууд", en: "Features" },
  spellDownload: { mn: "Татах, суулгах заавар", en: "Download and install instructions" },
  spellSteps: { mn: "Хэрхэн авах вэ", en: "How to get it" },
};

export type SiteContentDefinition = {
  /** Stable identifier. Never rename: stored revisions refer to it. */
  key: string;
  page: SiteContentPageId;
  section: SiteContentSectionId;
  label: { mn: string; en: string };
  /** Dotted path into the i18n Dictionary whose string this key overrides (array items use their index). */
  dictionaryPath: string;
  maxLength: number;
  multiline: boolean;
  kind: "editorial";
  /** Shown to editors: where this text appears and, importantly, where it does NOT. */
  note?: { mn: string; en: string };
  /** "metadata" keys get a search-result/browser-tab preview in the editor. */
  role?: "metaTitle" | "metaDescription";
};

type Spec = {
  key: string;
  section: SiteContentSectionId;
  label: [string, string];
  path: string;
  max: number;
  multiline?: boolean;
  note?: [string, string];
  role?: SiteContentDefinition["role"];
};

function build(page: SiteContentPageId, specs: readonly Spec[]): SiteContentDefinition[] {
  return specs.map((x) => ({
    key: x.key,
    page,
    section: x.section,
    label: { mn: x.label[0], en: x.label[1] },
    dictionaryPath: x.path,
    maxLength: x.max,
    multiline: x.multiline ?? false,
    kind: "editorial" as const,
    ...(x.note ? { note: { mn: x.note[0], en: x.note[1] } } : {}),
    ...(x.role ? { role: x.role } : {}),
  }));
}

const PRODUCTS = ["citizen", "student", "lawyer", "firm", "team"] as const;
const PRODUCT_LABELS = {
  citizen: ["Иргэн", "Citizen"],
  student: ["Оюутан", "Student"],
  lawyer: ["Хуульч", "Lawyer"],
  firm: ["Фирм", "Firm"],
  team: ["Баг", "Team"],
} as const;
const FAQ_COUNT = 4;

const HOME_SPECS: Spec[] = [
  { key: "home.hero.brandLine", section: "hero", label: ["Брэндийн мөр", "Brand line"], path: "publicHome.brandLine", max: 80 },
  {
    key: "home.hero.tagline",
    section: "hero",
    label: ["Үндсэн уриа", "Main tagline"],
    path: "publicHome.tagline",
    max: 120,
    note: [
      "Зөвхөн нүүр хуудасны гол толгой хэсэгт өөрчлөгдөнө. Хөл хэсгийн уриа болон хөтчийн гарчиг/хайлтын тайлбар (title, OG) тусдаа бөгөөд энэ түлхүүрээр өөрчлөгдөхгүй.",
      "Changes the homepage hero only. The footer tagline and the browser title / search-preview text are separate and are not changed by this key.",
    ],
  },
  { key: "home.hero.chatTitle", section: "legalAi", label: ["Чатын гарчиг", "Chat title"], path: "publicHome.chatTitle", max: 120 },
  { key: "home.hero.chatSubtitle", section: "legalAi", label: ["Чатын тайлбар", "Chat subtitle"], path: "publicHome.chatSubtitle", max: 300, multiline: true },
  { key: "home.legalAi.placeholder", section: "legalAi", label: ["Чатын оролтын жишээ текст", "Chat input placeholder"], path: "publicHome.chatPlaceholder", max: 80 },
  { key: "home.legalAi.submit", section: "legalAi", label: ["Чатын илгээх товч", "Chat send button"], path: "publicHome.chatSubmit", max: 30 },
  { key: "home.legalAi.suggestionsLabel", section: "legalAi", label: ["Жишээ асуултын гарчиг", "Example questions label"], path: "publicHome.chatSuggestionsLabel", max: 60 },
  ...[0, 1, 2, 3, 4].map((i): Spec => ({
    key: `home.legalAi.suggestion.${i}`,
    section: "legalAi",
    label: [`Жишээ асуулт ${i + 1}`, `Example question ${i + 1}`],
    path: `publicHome.chatSuggestions.${i}`,
    max: 80,
  })),
  { key: "home.intro.title", section: "intro", label: ["Танилцуулгын гарчиг", "Introduction title"], path: "publicHome.introTitle", max: 120 },
  { key: "home.intro.body", section: "intro", label: ["Танилцуулгын текст", "Introduction text"], path: "publicHome.introBody", max: 600, multiline: true },
  ...PRODUCTS.flatMap((product): Spec[] => [
    {
      key: `home.products.${product}.description`,
      section: "products",
      label: [`Бүтээгдэхүүний тайлбар — ${PRODUCT_LABELS[product][0]}`, `Product description — ${PRODUCT_LABELS[product][1]}`],
      path: `publicHome.products.${product}.description`,
      max: 240,
      multiline: true,
    },
    {
      key: `home.products.${product}.cta`,
      section: "products",
      label: [`Товчлуурын бичиг — ${PRODUCT_LABELS[product][0]}`, `Call-to-action text — ${PRODUCT_LABELS[product][1]}`],
      path: `publicHome.products.${product}.cta`,
      max: 40,
      note: ["Зөвхөн товчлуурын бичиг. Хаашаа очих нь (холбоос) болон хандах эрх кодоор тодорхойлогдоно.", "Button wording only. Where it goes and who may access it is decided in code."],
    },
  ]),
  { key: "home.marketplace.eyebrow", section: "marketplace", label: ["Дээд шошго", "Eyebrow"], path: "landing.marketEyebrow", max: 60 },
  { key: "home.marketplace.title", section: "marketplace", label: ["Гарчиг", "Title"], path: "landing.marketTitle", max: 120 },
  { key: "home.marketplace.support", section: "marketplace", label: ["Тайлбар", "Supporting text"], path: "landing.marketSupport", max: 400, multiline: true },
  { key: "home.marketplace.cta", section: "marketplace", label: ["Товчлуурын бичиг", "Call-to-action text"], path: "landing.marketCta", max: 40 },
  { key: "home.faq.eyebrow", section: "faq", label: ["FAQ дээд шошго", "FAQ eyebrow"], path: "landing.faqEyebrow", max: 60 },
  { key: "home.faq.title", section: "faq", label: ["FAQ гарчиг", "FAQ title"], path: "landing.faqTitle", max: 120 },
  { key: "home.faq.support", section: "faq", label: ["FAQ тайлбар", "FAQ supporting text"], path: "landing.faqSupport", max: 400, multiline: true },
  ...Array.from({ length: FAQ_COUNT }, (_, i): Spec[] => [
    { key: `home.faq.${i}.question`, section: "faq", label: [`FAQ ${i + 1} — асуулт`, `FAQ ${i + 1} — question`], path: `landing.faqs.${i}.q`, max: 160 },
    {
      key: `home.faq.${i}.answer`,
      section: "faq",
      label: [`FAQ ${i + 1} — хариулт`, `FAQ ${i + 1} — answer`],
      path: `landing.faqs.${i}.a`,
      max: 800,
      multiline: true,
      note: [
        "Хариулт нь хууль зүйн болон бүтээгдэхүүний нөхцөл байдлыг тодорхойлдог. Өөрчлөхөөсөө өмнө үнэн зөв эсэхийг шалгана уу.",
        "Answers describe what TORE does and does not do. Verify accuracy before publishing a change.",
      ],
    },
  ]).flat(),
  { key: "home.intelligence.title", section: "intelligence", label: ["Гарчиг", "Title"], path: "publicHome.intelligenceTitle", max: 120 },
  { key: "home.intelligence.lead", section: "intelligence", label: ["Тайлбар", "Lead text"], path: "publicHome.intelligenceLead", max: 400, multiline: true },
  { key: "home.feedback.title", section: "feedback", label: ["Санал хүсэлтийн гарчиг", "Feedback title"], path: "publicHome.feedbackTitle", max: 120 },
  { key: "home.feedback.lead", section: "feedback", label: ["Санал хүсэлтийн заавар", "Feedback instructions"], path: "publicHome.feedbackLead", max: 400, multiline: true },
  { key: "home.feedback.success", section: "feedback", label: ["Илгээсний дараах мэдэгдэл", "Message after sending"], path: "publicHome.feedbackSuccess", max: 200 },
];

const SHARED_SPECS: Spec[] = [
  { key: "shared.nav.products", section: "nav", label: ["Цэс — Бүтээгдэхүүн", "Menu — Products"], path: "publicHome.navProducts", max: 30 },
  { key: "shared.nav.services", section: "nav", label: ["Цэс — Үйлчилгээ", "Menu — Services"], path: "publicHome.navServices", max: 30 },
  { key: "shared.nav.library", section: "nav", label: ["Цэс — Сан", "Menu — Library"], path: "publicHome.navLibrary", max: 30 },
  { key: "shared.nav.intelligence", section: "nav", label: ["Цэс — Мэдээлэл", "Menu — Intelligence"], path: "publicHome.navIntelligence", max: 30 },
  { key: "shared.nav.help", section: "nav", label: ["Цэс — Тусламж", "Menu — Help"], path: "publicHome.navHelp", max: 30 },
  { key: "shared.nav.signUp", section: "nav", label: ["Цэс — Бүртгүүлэх", "Menu — Sign up"], path: "publicHome.navSignUp", max: 30 },
  { key: "shared.nav.feedback", section: "nav", label: ["Цэс — Санал хүсэлт", "Menu — Feedback"], path: "publicHome.navFeedback", max: 30 },
  { key: "shared.footer.tagline", section: "footer", label: ["Хөл хэсгийн тайлбар", "Footer description"], path: "publicHome.footerTagline", max: 240, multiline: true },
  {
    key: "shared.meta.title",
    section: "meta",
    label: ["Хөтчийн гарчиг (үндсэн)", "Browser title (default)"],
    path: "meta.title",
    max: 70,
    role: "metaTitle",
    note: ["Бусад хуудас өөрийн гарчигтай бол тэр давамгайлна (жишээ нь /spell).", "Pages that set their own title (for example /spell) keep theirs."],
  },
  { key: "shared.meta.description", section: "meta", label: ["Хайлтын тайлбар (үндсэн)", "Search description (default)"], path: "meta.description", max: 160, role: "metaDescription" },
];

/**
 * TORE Spell public page. Prices, purchase/checkout wording, licence terms ("one licence, one computer…"), the unsigned-installer
 * disclosure and every payment/licence message are deliberately NOT listed. These keys exist only when the Spell copy exists in the
 * dictionary (see isSiteContentDefinitionAvailable), so this registry also works on branches that do not contain Spell.
 */
const SPELL_SPECS: Spec[] = [
  { key: "spell.hero.eyebrow", section: "spellHero", label: ["Дээд шошго", "Eyebrow"], path: "spell.hero.eyebrow", max: 60 },
  { key: "spell.hero.title", section: "spellHero", label: ["Гарчиг", "Title"], path: "spell.hero.title", max: 120 },
  { key: "spell.hero.support", section: "spellHero", label: ["Тайлбар", "Supporting text"], path: "spell.hero.support", max: 300, multiline: true },
  { key: "spell.hero.secondaryCta", section: "spellHero", label: ["Хоёрдогч товчлуур", "Secondary button"], path: "spell.hero.secondaryCta", max: 40 },
  { key: "spell.hero.platform", section: "spellHero", label: ["Платформын тэмдэглэгээ", "Platform line"], path: "spell.hero.platform", max: 80 },
  { key: "spell.meta.title", section: "spellHero", label: ["Хөтчийн гарчиг", "Browser title"], path: "spell.meta.title", max: 70, role: "metaTitle" },
  { key: "spell.meta.description", section: "spellHero", label: ["Хайлтын тайлбар", "Search description"], path: "spell.meta.description", max: 160, role: "metaDescription" },
  { key: "spell.features.title", section: "spellFeatures", label: ["Боломжуудын гарчиг", "Features title"], path: "spell.features.title", max: 80 },
  ...[0, 1, 2, 3].flatMap((i): Spec[] => [
    { key: `spell.features.${i}.title`, section: "spellFeatures", label: [`Боломж ${i + 1} — гарчиг`, `Feature ${i + 1} — title`], path: `spell.features.items.${i}.title`, max: 80 },
    {
      key: `spell.features.${i}.description`,
      section: "spellFeatures",
      label: [`Боломж ${i + 1} — тайлбар`, `Feature ${i + 1} — description`],
      path: `spell.features.items.${i}.description`,
      max: 240,
      multiline: true,
      note: ["Зөвхөн бүтээгдэхүүний бодитоор хийдэг зүйлийг бичнэ үү.", "Describe only what the shipped product really does."],
    },
  ]),
  { key: "spell.download.cta", section: "spellDownload", label: ["Татах товчлуурын бичиг", "Download button text"], path: "spell.download.cta", max: 40 },
  { key: "spell.download.note", section: "spellDownload", label: ["Татах заавар", "Download instruction"], path: "spell.download.note", max: 240, multiline: true },
  {
    key: "spell.download.requirements",
    section: "spellDownload",
    label: ["Системийн шаардлага", "System requirements"],
    path: "spell.download.requirements",
    max: 300,
    multiline: true,
    note: ["Бодит суулгацтай таарч байх ёстой — Windows хувилбар, 64-бит, идэвхжүүлэлтийн нөхцөл. Шалгаад нийтэлнэ үү.", "Must match the real installer (Windows version, 64-bit, activation). Verify before publishing."],
  },
  { key: "spell.steps.title", section: "spellSteps", label: ["Гарчиг", "Title"], path: "spell.steps.title", max: 80 },
  ...[0, 1, 2, 3].flatMap((i): Spec[] => [
    { key: `spell.steps.${i}.title`, section: "spellSteps", label: [`Алхам ${i + 1} — гарчиг`, `Step ${i + 1} — title`], path: `spell.steps.items.${i}.title`, max: 60 },
    { key: `spell.steps.${i}.description`, section: "spellSteps", label: [`Алхам ${i + 1} — тайлбар`, `Step ${i + 1} — description`], path: `spell.steps.items.${i}.description`, max: 200, multiline: true },
  ]),
];

/** Every key the registry knows, including ones whose default text is missing on this branch (Spell). */
export const ALL_SITE_CONTENT_DEFINITIONS: readonly SiteContentDefinition[] = [
  ...build("home", HOME_SPECS),
  ...build("shared", SHARED_SPECS),
  ...build("spell", SPELL_SPECS),
];

const BY_KEY = new Map(ALL_SITE_CONTENT_DEFINITIONS.map((d) => [d.key, d]));

/** Looks a key up among ALL registered definitions. Editing code must use the catalog (available keys only); applying overrides may use this. */
export function getSiteContentDefinition(key: string): SiteContentDefinition | undefined {
  return BY_KEY.get(key);
}

export function isSiteContentLocale(value: unknown): value is SiteContentLocale {
  return typeof value === "string" && (SITE_CONTENT_LOCALES as readonly string[]).includes(value);
}

export type SiteContentValidation = { ok: true; value: string } | { ok: false; reason: string };

// Control characters other than tab/newline are never legitimate copy.
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if ((code < 32 && code !== 9 && code !== 10) || code === 127) return true;
  }
  return false;
}

/**
 * Editable content is PLAIN TEXT only. Markup characters are refused outright rather than escaped, so a stored value can never
 * be interpreted as HTML by any current or future consumer. (React also escapes text, this is the second layer.)
 */
export function validateSiteContentValue(definition: SiteContentDefinition, raw: unknown): SiteContentValidation {
  if (typeof raw !== "string") return { ok: false, reason: "Текст байх ёстой." };
  const value = raw.replace(/\r\n/g, "\n").trim();
  if (value.length === 0) return { ok: false, reason: "Хоосон байж болохгүй." };
  if (value.length > definition.maxLength) {
    return { ok: false, reason: `Хэт урт: дээд тал нь ${definition.maxLength} тэмдэгт.` };
  }
  if (hasControlChars(value)) return { ok: false, reason: "Хориотой удирдлагын тэмдэгт байна." };
  if (/[<>]/.test(value)) return { ok: false, reason: "HTML тэмдэгт (< >) оруулах боломжгүй — зөвхөн энгийн текст." };
  if (!definition.multiline && value.includes("\n")) return { ok: false, reason: "Нэг мөр байх ёстой." };
  return { ok: true, value };
}

function readPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** The code-owned default for `definition`, or undefined if the dictionary no longer has that path. */
export function getSiteContentDefault(dictionary: unknown, definition: SiteContentDefinition): string | undefined {
  const value = readPath(dictionary, definition.dictionaryPath);
  return typeof value === "string" ? value : undefined;
}

export type SiteContentOverrides = Readonly<Record<string, string>>;

/**
 * Returns a copy of `dictionary` with each valid override applied at its registered path. Unknown keys, values that fail
 * validation again, and paths that no longer exist in the dictionary are ignored — the code-owned default always remains
 * the safe fallback. The input is never mutated.
 */
export function applySiteContentOverrides<T extends object>(dictionary: T, overrides: SiteContentOverrides): T {
  const copy = structuredClone(dictionary) as T;
  for (const [key, raw] of Object.entries(overrides)) {
    const definition = getSiteContentDefinition(key);
    if (!definition) continue;
    const checked = validateSiteContentValue(definition, raw);
    if (!checked.ok) continue;
    const parts = definition.dictionaryPath.split(".");
    const last = parts.pop() as string;
    let cursor: unknown = copy;
    for (const part of parts) {
      cursor = cursor !== null && typeof cursor === "object" ? (cursor as Record<string, unknown>)[part] : undefined;
    }
    if (cursor !== null && typeof cursor === "object" && typeof (cursor as Record<string, unknown>)[last] === "string") {
      (cursor as Record<string, unknown>)[last] = checked.value;
    }
  }
  return copy;
}
