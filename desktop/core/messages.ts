/** Mongolian user-facing copy for the desktop client. Times are shown in Asia/Ulaanbaatar. */

export const SPELL_TRANSFER_WARNING_MN =
  "Энэ license одоогоор өөр компьютерт идэвхтэй байна. Шинэ компьютерт шилжүүлбэл өмнөх компьютер дээр ашиглах эрх хүчингүй болно.";

export const CLIENT_ERROR_MN: Readonly<Record<string, string>> = {
  NETWORK: "Сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.",
  LICENSE_CODE_INVALID: "License код буруу байна. Кодоо шалгаад дахин оруулна уу.",
  LICENSE_REVOKED: "Энэ license хүчингүй болсон байна.",
  LICENSE_EXPIRED: "Энэ license-ийн хугацаа дууссан байна. Автоматаар сунгагдахгүй; шинэ license авна уу.",
  LICENSE_REDEEM_WINDOW_CLOSED: "Энэ license-ийг идэвхжүүлэх хугацаа өнгөрсөн байна.",
  TRANSFER_CONFIRMATION_REQUIRED: SPELL_TRANSFER_WARNING_MN,
  TRANSFER_COOLDOWN_ACTIVE: "Энэ license саяхан шилжсэн тул одоогоор дахин шилжүүлэх боломжгүй.",
  ACTIVATION_NOT_ACTIVE: "Энэ компьютер дээр license идэвхгүй болсон байна. Дахин идэвхжүүлнэ үү.",
  INSTALLATION_REVOKED: "Энэ суулгалтын эрх хаагдсан байна.",
  INSTALLATION_UNKNOWN: "Энэ суулгалт бүртгэлгүй байна. License-ээ дахин идэвхжүүлнэ үү.",
  REQUEST_SIGNATURE_INVALID: "Хүсэлтийн гарын үсэг буруу байна.",
  REQUEST_TIMESTAMP_INVALID: "Компьютерийн цаг буруу байна. Огноо, цагаа шалгана уу.",
  REQUEST_REPLAYED: "Хүсэлт давхардсан байна. Дахин оролдоно уу.",
  TOO_MANY_ATTEMPTS: "Оролдлого хэт олон боллоо. Түр хүлээгээд дахин оролдоно уу.",
  ACTIVATION_CONFLICT: "License өөр хүсэлтээр өөрчлөгдөж байна. Дахин оролдоно уу.",
  SPELL_DISABLED: "Үйлчилгээ одоогоор нээгдээгүй байна.",
  SPELL_NOT_CONFIGURED: "Үйлчилгээ түр хүртээмжгүй байна.",
  TOKEN_INVALID: "Серверээс ирсэн эрхийн мэдээлэл таны компьютерт тохирохгүй байна. Дахин идэвхжүүлнэ үү.",
  TOKEN_EXPIRED: "Эрхийн мэдээллийн хугацаа дууссан. Интернэтэд холбогдож эрхээ шалгана уу.",
  TOKEN_UNKNOWN_KEY: "Эрхийн мэдээллийг баталгаажуулах түлхүүр танигдсангүй. Программаа шинэчилнэ үү.",
  TOKEN_BAD_SIGNATURE: "Эрхийн мэдээллийн гарын үсэг буруу байна. Хүлээн авахаас татгалзлаа.",
  TOKEN_MALFORMED: "Эрхийн мэдээлэл буруу бүтэцтэй байна. Хүлээн авахаас татгалзлаа.",
  PINNED_KEYS_MISSING: "Программын тохиргоо дутуу байна. Албан ёсны суулгацыг дахин татна уу.",
  SECURE_STORAGE_UNAVAILABLE: "Энэ компьютерийн нууц хадгалалт ашиглах боломжгүй тул лицензийг аюулгүй хадгалж чадсангүй.",
  INTERNAL: "Серверийн алдаа гарлаа. Дараа дахин оролдоно уу.",
};

export function messageForCode(code: string): string {
  return CLIENT_ERROR_MN[code] ?? CLIENT_ERROR_MN.INTERNAL!;
}

const UB = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ulaanbaatar",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Format an instant as an unambiguous «YYYY-MM-DD HH:mm (УБ)» in Asia/Ulaanbaatar (UTC+8, no DST). */
export function formatUlaanbaatar(iso: string | Date): string {
  const p = Object.fromEntries(UB.formatToParts(typeof iso === "string" ? new Date(iso) : iso).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} (УБ)`;
}
