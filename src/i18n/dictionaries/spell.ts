import type { SpellCopy } from "@/i18n/types";

/**
 * TORE Spell public product copy. TORE Spell is a SEPARATE commercial
 * product (a desktop spelling checker); TORE.MN only introduces it.
 *
 * Style rules: product first, short sentences, concrete nouns. Describe only
 * what the shipped product does. No grammar/style/AI-rewrite/Word/system-wide
 * claims, no accuracy percentages, no prices (prices are server configuration).
 * Engine verdict names (VALID / MISSPELLED / UNKNOWN) never appear in public copy.
 */
export const spellMn: SpellCopy = {
  home: {
    name: "TORE Spell",
    tag: "Windows",
    audience: "Монгол хэлээр бичдэг хүн бүрт",
    description: "Монгол хэлний зөв бичгийн алдаа шалгагч. Бичиж байх үедээ алдааг таньж, зөв хувилбар санал болгоно.",
    standalone: "TORE.MN-ээс тусдаа бүтээгдэхүүн",
    cta: "TORE Spell-ийг үзэх",
  },
  meta: {
    title: "TORE Spell — Монгол хэлний зөв бичгийн алдаа шалгагч",
    description: "Бичиж байх үедээ алдааг таньж, зөв хувилбар санал болгоно. Windows компьютер дээр ажиллана.",
  },
  hero: {
    eyebrow: "TORE Spell · Windows",
    title: "Монгол хэлний зөв бичгийн алдаа шалгагч",
    support: "Бичиж байх үедээ алдааг таньж, зөв хувилбар санал болгоно.",
    primaryCta: "Худалдан авах",
    secondaryCta: "Хэрхэн ажилладаг вэ",
    platform: "Windows компьютер дээр ажиллана",
    priceFrom: "{price}-өөс эхэлнэ",
    mockCaption: "Жишээ дүрслэл",
    mockText: "Манай сургуулын захирал ирлээ.",
    mockWrong: "сургуулын",
    mockRight: "сургуулийн",
    mockSuggestionLabel: "Зөв хувилбар",
  },
  features: {
    title: "Юу хийдэг вэ",
    items: [
      { title: "Зөв бичгийн алдаа шалгана", description: "Үг, нөхцөл, дагаврын алдааг бичиж байх үедээ олно." },
      { title: "Зөв хувилбар санал болгоно", description: "Итгэлтэй үедээ л санал болгоно; нэг товшоод засна." },
      { title: "Хувийн толь", description: "Нэр, нэр томьёогоо нэмбэл дахин тэмдэглэхгүй." },
      { title: "Компьютер дээр ажиллана", description: "Таны бичсэн текст компьютерээс гарахгүй." },
    ],
  },
  download: { cta: "Windows-д татах", note: "Лиценз авсны дараа «Миний лиценз» хэсгээс татна.", soon: "Windows суулгац удахгүй.", platform: "Windows",
    requirements: "Windows 10 эсвэл түүнээс дээш, 64-бит. Идэвхжүүлэхэд интернэт хэрэгтэй; идэвхжсэний дараа 24 цаг хүртэл интернэтгүй ажиллана.",
    unsigned: "Beta суулгацад дижитал гарын үсэг одоогоор байхгүй тул Windows SmartScreen анхааруулга харуулж болно." },
  steps: {
    title: "Хэрхэн авах вэ",
    items: [
      { title: "Худалдан авах", description: "QPay-ээр төлнө." },
      { title: "Суулгах", description: "Windows суулгацаа татаж суулгана." },
      { title: "Код оруулах", description: "Лицензийн кодоо оруулж идэвхжүүлнэ." },
      { title: "Ашиглах", description: "Бичиж эхэлнэ." },
    ],
  },
  pricing: {
    eyebrow: "Үнэ",
    title: "Лиценз сонгох",
    description: "Хугацаагаа сонгоно уу.",
    durations: ["1 сар", "3 сар", "6 сар", "1 жил"],
    note: "Нэг лиценз — нэг компьютер. Хугацаа дуусахад автоматаар сунгагдахгүй. Өөр компьютерт шилжүүлж болно.",
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
};

export const spellEn: SpellCopy = {
  home: {
    name: "TORE Spell",
    tag: "Windows",
    audience: "For anyone who writes in Mongolian",
    description: "A Mongolian spelling checker. It spots mistakes as you write and suggests the correct form.",
    standalone: "A separate product from TORE.MN",
    cta: "View TORE Spell",
  },
  meta: {
    title: "TORE Spell — Mongolian spelling checker",
    description: "Spots mistakes as you write and suggests the correct form. Runs on Windows.",
  },
  hero: {
    eyebrow: "TORE Spell · Windows",
    title: "Mongolian spelling checker",
    support: "It spots mistakes as you write and suggests the correct form.",
    primaryCta: "Buy",
    secondaryCta: "How it works",
    platform: "Runs on Windows",
    priceFrom: "From {price}",
    mockCaption: "Illustration",
    mockText: "Манай сургуулын захирал ирлээ.",
    mockWrong: "сургуулын",
    mockRight: "сургуулийн",
    mockSuggestionLabel: "Correction",
  },
  features: {
    title: "What it does",
    items: [
      { title: "Checks spelling", description: "Finds word, case and suffix mistakes as you type." },
      { title: "Suggests the correct form", description: "Only when it is confident; one click to fix." },
      { title: "Personal dictionary", description: "Add names and terms once; they are not flagged again." },
      { title: "Runs on your computer", description: "The text you write stays on your computer." },
    ],
  },
  download: { cta: "Download for Windows", note: "After you get a licence, download it from «My licence».", soon: "The Windows installer is coming soon.", platform: "Windows",
    requirements: "Windows 10 or newer, 64-bit. Activation needs an internet connection; after that it works offline for up to 24 hours.",
    unsigned: "The beta installer is not digitally signed yet, so Windows SmartScreen may show a warning." },
  steps: {
    title: "How to get it",
    items: [
      { title: "Buy", description: "Pay with QPay." },
      { title: "Install", description: "Download and install the Windows app." },
      { title: "Enter the code", description: "Enter your licence code to activate." },
      { title: "Use", description: "Start writing." },
    ],
  },
  pricing: {
    eyebrow: "Price",
    title: "Choose a licence",
    description: "Choose the term.",
    durations: ["1 month", "3 months", "6 months", "1 year"],
    note: "One licence — one computer. Not renewed automatically. Can be moved to another computer.",
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
};
