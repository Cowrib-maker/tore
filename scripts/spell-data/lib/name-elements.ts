/**
 * Mongolian personal-name ELEMENTS (AI-drafted from general knowledge, PENDING_NATIVE_REVIEW). Many Mongolian given names are compounds
 * of such elements (Бат+баяр, Мөнх+бат, Оюун+гэрэл). A capitalised, otherwise-unknown token that is made ONLY of ≥2 elements is structurally
 * a plausible Mongolian name — evidence for PROTECTION (never for «valid word»).
 */
export const NAME_ELEMENTS = new Set(
  `бат баяр болд мөнх оюун эрдэнэ цогт сайхан наран алтан гэрэл хүрэл баатар дорж жаргал энх ган түвшин төгс билэг сүх хишиг цэцэг цэрэн дэлгэр
  наран тунгалаг сарангэрэл сарнай саран сайн солонго соёл тэмүүлэн түмэн тулга тогтох төмөр урт уянга ундрах уул үүрцайх хонгор хулан чимэг чулуун
  чойжин шинэ шүрэн ширчин энхтуяа эрдэм эрхэм өлзий өнөр өсөх амар амгалан ариун ананд ану анхтуяа ачит бадам бадрах байгал балжин барс бямба батсүх
  баясгалан билгүүн болор бурам бүрэн буян вандан гантөмөр ганхүү ганзориг ганбат гүнсэн гэрэлт дамдин дашдорж дашзэвэг дондов дулам дуламсүрэн
  дэлгэрмөрөн жавзан жамъян жанцан жигжид зоригт зул золбаяр зориг лхагва лхагвасүрэн лхам лхамсүрэн мандах мандал мөнгөн мягмар номин нандин нармандах
  нарангэрэл нацаг нямдорж нямаа нямсүрэн оргил очир одгэрэл одонтуяа отгон оюунчимэг пүрэв пүрэвдорж рагчаа рэнчин сандаг сарантуяа сүрэн сэргэлэн
  сэржмягмар сэнгэ тайван тогтох тоомор төрбат төрмөнх түдэв тэнгис тэргүүн увс ууганбаяр хангай хулан хурц цагаан цогзол цэвээн цэдэв цэнд цэнгүүн
  чингүүн шагдар шижир эрхэс эрдэнэбат эрдэнэтуяа энхбат энхбаяр энхболд энхжаргал энхтөр энхсайхан энхтайван өлзийтөгс өлзий`.split(/\s+/).filter((w) => w.length >= 3),
);

/** True when `word` (lower-case) is exactly 2–3 name elements concatenated (each ≥3 letters), optionally with a final case-suffix-free ending. */
export function isNameCompound(word: string): boolean {
  if (word.length < 6) return false;
  const rec = (w: string, parts: number): boolean => {
    if (w === "") return parts >= 2;
    if (parts >= 3) return false;
    for (let i = Math.min(w.length, 9); i >= 3; i -= 1) if (NAME_ELEMENTS.has(w.slice(0, i)) && rec(w.slice(i), parts + 1)) return true;
    return false;
  };
  return rec(word, 0);
}
