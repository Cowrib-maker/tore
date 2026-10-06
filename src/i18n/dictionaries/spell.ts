import type { SpellCopy } from "@/i18n/types";

/**
 * TORE Spell public product copy. TORE Spell is a SEPARATE commercial
 * product (a desktop spelling checker); TORE.MN only introduces it.
 *
 * Truthfulness rules for this file: describe only what the shipped beta
 * does. No grammar/AI-rewrite/Word/system-wide integration claims, no
 * accuracy percentages, no invented prices (the plan catalog has durations
 * only; pricing arrives with the payment phase).
 */
export const spellMn: SpellCopy = {
  home: {
    name: "TORE Spell",
    tag: "Тусдаа бүтээгдэхүүн · Бета",
    audience: "Монгол хэлээр бичдэг хүн бүрт",
    description:
      "Монгол хэлний зөв бичих алдаа шалгагч desktop программ. Бичих явцад алдааг таньж, зөв хувилбар санал болгоно.",
    standalone: "TORE.MN-ээс тусдаа бүтээгдэхүүн",
    cta: "TORE Spell-ийг үзэх",
  },
  meta: {
    title: "TORE Spell — Монгол хэлний зөв бичих болон найруулгын алдаа шалгагч",
    description:
      "TORE Spell нь Монгол хэлний зөв бичих алдааг таньж, зөв хувилбар санал болгодог desktop бүтээгдэхүүн. Одоогоор Windows дээрх хяналттай бета хувилбар; тодорхойгүй үгийг автоматаар засахгүй.",
  },
  hero: {
    eyebrow: "TORE Spell · Бета",
    title: "Монгол хэлний зөв бичих болон найруулгын алдаа шалгагч",
    support: "Бичих явцад алдааг таньж, зөв хувилбар санал болгоно.",
    primaryCta: "TORE Spell авах",
    secondaryCta: "Дэлгэрэнгүй үзэх",
    betaNote:
      "Windows бета хувилбар. Төлбөрийг QPay-ээр хийнэ; лиценз нь төлбөр баталгаажсаны дараа үүснэ.",
    mockCaption: "Жишээ дүрслэл — бодит программын ажиллагааг харуулсан зураглал",
    mockText: "Тэр маш сайнн ажилласан.",
    mockWrong: "сайнн",
    mockRight: "сайн",
    mockSuggestionLabel: "Санал",
    mockWrongLabel: "Алдаатай",
    mockUnknownWord: "Зоригтбаатар",
    mockUnknownLabel: "Тодорхойгүй — автоматаар засахгүй",
  },
  relation: {
    title: "Тусдаа бүтээгдэхүүн",
    statement:
      "TORE Spell нь TORE.MN-ийн хууль зүйн платформоос тусдаа бүтээгдэхүүн бөгөөд Монгол хэлээр ажиллахад зориулсан desktop алдаа шалгагч юм.",
    back: "TORE.MN-ийн нүүр хуудас",
  },
  features: {
    eyebrow: "Боломжууд",
    title: "Юу хийдэг вэ",
    support: "Бета хувилбарт одоо ажиллаж байгаа боломжууд.",
    items: [
      {
        title: "Зөв бичих алдаа шалгах",
        description:
          "Үгийн бичлэг болон нөхцөл, дагаврын хэлбэрийг шалгаж, итгэлтэй тохиолдолд зөв хувилбарыг санал болгоно.",
      },
      {
        title: "Тодорхойгүй үгийг ялгаж харуулна",
        description:
          "Мэдэхгүй үгийг алдаа гэж буруутгахгүй, өөрөөр бодож автоматаар засахгүй. «Алдаатай» ба «Тодорхойгүй» нь тусдаа тэмдэглэгдэнэ.",
      },
      {
        title: "Хувийн толь",
        description:
          "Нэр, нэр томьёо, өөрийн үгээ толинд нэмбэл дахин алдаа гэж тэмдэглэхгүй. Толь таны компьютерт хадгалагдана.",
      },
      {
        title: "Текст таны компьютер дээр шалгагдана",
        description:
          "Шалгалт программ дотроо хийгдэнэ. Лицензийн шалгалтад зөвхөн лиценз болон компьютерийн мэдээлэл дамжина — таны бичсэн текст биш.",
      },
      {
        title: "Нэг лиценз — нэг идэвхтэй компьютер",
        description:
          "Лицензийг өөр компьютерт шилжүүлж болно. Шилжүүлэхийн өмнө баталгаажуулалт асууна; шилжүүлсний дараа өмнөх компьютер дээрх эрх хүчингүй болно.",
      },
      {
        title: "Хугацаатай лиценз",
        description:
          "Лиценз тодорхой хугацаатай бөгөөд хугацаа дуусахад автоматаар сунгагдахгүй. Идэвхжүүлсний дараа интернэтгүйгээр хязгаарлагдмал хугацаанд (сүүлийн шалгалтаас хойш 24 цаг хүртэл) ажиллана.",
      },
    ],
  },
  roadmap: {
    eyebrow: "Хөгжүүлэлтийн чиглэл",
    title: "Одоогоор бета хувилбарт ороогүй",
    support: "Эдгээр нь чиглэл бөгөөд бэлэн боломж гэж ойлгож болохгүй.",
    items: [
      {
        title: "Найруулгын алдааг илрүүлэх",
        description:
          "Үгийн бичлэгээс цааш өгүүлбэрийн найруулгын алдааг таних чиглэлд хөгжүүлж байна. Бета хувилбарт энэ боломж ороогүй.",
      },
      {
        title: "macOS хувилбар",
        description:
          "Лицензийн систем macOS-ийг дэмжихээр бэлтгэгдсэн ч desktop программ одоогоор зөвхөн Windows-д бэлэн болж байна.",
      },
    ],
  },
  beta: {
    eyebrow: "Хяналттай бета",
    title: "Бета хувилбар",
    description:
      "TORE Spell одоо хязгаарлагдмал хэрэглэгчдэд зориулсан Windows бета хувилбар хэлбэрээр шалгагдаж байна. Санал хүсэлт цуглуулж, алдааг засаж байна.",
    points: [
      "Windows дээр суулгаж ашиглана.",
      "Суулгац нь одоогоор дижитал гарын үсэггүй тул Windows SmartScreen анхааруулга харуулж болно.",
      "Үгсийн сан хараахан бүрэн биш: олон үг «Тодорхойгүй» гарах бөгөөд бүх алдааг илрүүлнэ гэж баталгаа өгөхгүй.",
      "Алдаатай, буруу санал, тодорхойгүй үгийн талаар программаас «Алдаа мэдээлэх» боломжтой.",
    ],
    cta: "Бета хандалт хүсэх",
    ctaNote: "Хүсэлтийг TORE.MN-ийн санал хүсэлтийн хэсгээр илгээнэ.",
  },
  pricing: {
    eyebrow: "Үнэ ба лиценз",
    title: "Лиценз сонгох",
    description: "Windows бета хувилбарын лицензийн хугацаагаа сонгоно уу.",
    durations: ["1 сар", "3 сар", "6 сар", "1 жил"],
    note: "Нэг лиценз — нэг идэвхтэй компьютер. Хугацаа дуусахад автоматаар сунгагдахгүй.",
    soon: "Үнэ удахгүй",
    buy: "Худалдан авах",
    loginToBuy: "Нэвтэрч худалдан авах",
    unavailable: "Худалдан авалт одоогоор нээгдээгүй байна.",
    checkout: {
      title: "QPay-ээр төлөх",
      scan: "QR кодыг банкны аппаараа уншуулна уу.",
      openApp: "Банкны апп нээх",
      waiting: "Төлбөр хүлээж байна…",
      paid: "Төлбөр баталгаажлаа",
      paidNote: "Таны лиценз бэлэн боллоо. Лицензийн код болон Windows хувилбарыг «Миний лиценз» хэсгээс авна уу.",
      myLicense: "Миний лиценз",
      error: "Төлбөрийн хүсэлт үүсгэж чадсангүй. Дахин оролдоно уу.",
      cancel: "Болих",
    },
  },
  honesty: {
    title: "Бидний амлалт",
    body: "Эргэлзээтэй үгийг буруу засахаас илүү «Тодорхойгүй» гэж үлдээнэ. Буруу засвар нь засвар хийхгүй байхаас дор гэж үздэг.",
  },
};

export const spellEn: SpellCopy = {
  home: {
    name: "TORE Spell",
    tag: "Separate product · Beta",
    audience: "For anyone who writes in Mongolian",
    description:
      "A desktop spelling checker for Mongolian. It recognises mistakes as you write and suggests the correct form.",
    standalone: "A separate product from TORE.MN",
    cta: "View TORE Spell",
  },
  meta: {
    title: "TORE Spell — Mongolian spelling and style checker",
    description:
      "TORE Spell is a desktop product that recognises Mongolian spelling mistakes and suggests corrections. Currently a controlled Windows beta; it never auto-corrects words it is unsure about.",
  },
  hero: {
    eyebrow: "TORE Spell · Beta",
    title: "A Mongolian spelling and style checker",
    support: "It recognises mistakes as you write and suggests the correct form.",
    primaryCta: "Get TORE Spell",
    secondaryCta: "Learn more",
    betaNote: "Windows beta. You pay with QPay; the licence is created once the payment is verified.",
    mockCaption: "Illustration — a sketch of how the app behaves",
    mockText: "Тэр маш сайнн ажилласан.",
    mockWrong: "сайнн",
    mockRight: "сайн",
    mockSuggestionLabel: "Suggestion",
    mockWrongLabel: "Misspelled",
    mockUnknownWord: "Зоригтбаатар",
    mockUnknownLabel: "Unknown — never auto-corrected",
  },
  relation: {
    title: "A separate product",
    statement:
      "TORE Spell is a separate product from the TORE.MN legal platform: a desktop checker built for working in Mongolian.",
    back: "TORE.MN home",
  },
  features: {
    eyebrow: "Capabilities",
    title: "What it does",
    support: "What works in the beta today.",
    items: [
      {
        title: "Spelling check",
        description:
          "Checks word spelling and case/suffix forms, and suggests the correct form when it is confident.",
      },
      {
        title: "Unknown words are shown separately",
        description:
          "Words it does not know are not accused or auto-corrected. “Misspelled” and “Unknown” are marked differently.",
      },
      {
        title: "Personal dictionary",
        description:
          "Add names, terms and your own words so they are not flagged again. The dictionary is stored on your computer.",
      },
      {
        title: "Text is checked on your computer",
        description:
          "Checking happens inside the app. Only licence and device information is sent for licence checks — never your text.",
      },
      {
        title: "One licence — one active computer",
        description:
          "A licence can be moved to another computer after an explicit confirmation; the previous computer loses access.",
      },
      {
        title: "Time-limited licence",
        description:
          "A licence has a fixed term and is not renewed automatically. After activation it works offline for a limited time (up to 24 hours after the last check).",
      },
    ],
  },
  roadmap: {
    eyebrow: "Direction",
    title: "Not in the beta yet",
    support: "These are directions, not available features.",
    items: [
      {
        title: "Style (stylistic) error detection",
        description:
          "Beyond word spelling, detecting sentence-level style problems is a development direction. It is not part of the beta.",
      },
      {
        title: "macOS version",
        description:
          "The licence system is prepared for macOS, but the desktop app is currently being prepared for Windows only.",
      },
    ],
  },
  beta: {
    eyebrow: "Controlled beta",
    title: "Beta version",
    description:
      "TORE Spell is being tested as a Windows beta with a limited group of users while we collect feedback and fix issues.",
    points: [
      "Installed and used on Windows.",
      "The installer is not yet code-signed, so Windows SmartScreen may show a warning.",
      "The dictionary is not complete: many words show as “Unknown”, and we do not promise to catch every mistake.",
      "Report a mistake, wrong suggestion or unknown word from inside the app.",
    ],
    cta: "Request beta access",
    ctaNote: "Requests are sent through the feedback section on TORE.MN.",
  },
  pricing: {
    eyebrow: "Pricing and licence",
    title: "Choose a licence",
    description: "Choose the term for the Windows beta licence.",
    durations: ["1 month", "3 months", "6 months", "1 year"],
    note: "One licence — one active computer. Not renewed automatically.",
    soon: "Pricing coming soon",
    buy: "Buy",
    loginToBuy: "Sign in to buy",
    unavailable: "Purchasing is not open yet.",
    checkout: {
      title: "Pay with QPay",
      scan: "Scan the QR code with your bank app.",
      openApp: "Open bank app",
      waiting: "Waiting for payment…",
      paid: "Payment verified",
      paidNote: "Your licence is ready. Get the licence code and the Windows build in “My licence”.",
      myLicense: "My licence",
      error: "Could not start the payment. Please try again.",
      cancel: "Cancel",
    },
  },
  honesty: {
    title: "Our commitment",
    body: "When unsure, we leave a word as “Unknown” rather than correct it wrongly. A wrong correction is worse than none.",
  },
};
