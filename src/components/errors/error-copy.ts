/**
 * Copy for the app's error boundaries (`app/error.tsx`, `app/global-error.tsx`). Error boundaries are Client Components rendered
 * when something has already failed, so they cannot load the server-side dictionary: the text is static, Mongolian (the product
 * language) with an English variant chosen from the document language. Other locales fall back to English.
 */
export type ErrorCopy = {
  title: string;
  body: string;
  retry: string;
  home: string;
  reference: string;
};

export const ERROR_COPY: Record<"mn" | "en", ErrorCopy> = {
  mn: {
    title: "Алдаа гарлаа",
    body: "Хуудсыг ачаалах үед гэнэтийн алдаа гарлаа. Дахин оролдоно уу. Асуудал давтагдвал доорх лавлах кодыг бидэнд илгээнэ үү.",
    retry: "Дахин оролдох",
    home: "Нүүр хуудас",
    reference: "Лавлах код",
  },
  en: {
    title: "Something went wrong",
    body: "An unexpected error occurred while loading this page. Please try again. If the problem continues, send us the reference code below.",
    retry: "Try again",
    home: "Home",
    reference: "Reference code",
  },
};

/** Picks the copy for a document language tag ("mn", "mn-MN", "en", "ko", ...). Mongolian is the default. */
export function errorCopyFor(documentLang: string | null | undefined): ErrorCopy {
  const primary = (documentLang ?? "").toLowerCase().split("-")[0];
  if (primary === "" || primary === "mn") return ERROR_COPY.mn;
  return ERROR_COPY.en;
}
