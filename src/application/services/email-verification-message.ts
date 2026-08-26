export function buildEmailVerificationMessage(params: {
  appName: string;
  toName: string | null;
  otp: string;
  ttlMinutes: number;
}): { subject: string; text: string; html: string } {
  const greeting = params.toName
    ? `${params.toName} танаа,`
    : "Таны TORE бүртгэлд:";
  const subject = "TORE — И-мэйл баталгаажуулах код";
  const ttlLine = `Энэ код ${params.ttlMinutes} минутын хугацаанд хүчинтэй.`;
  const text = [
    greeting,
    "",
    "Таны TORE баталгаажуулах код:",
    params.otp,
    "",
    ttlLine,
    "",
    "Хэрэв та энэ бүртгэлийг үүсгээгүй бол энэ имэйлийг үл тооно уу.",
    "",
    `— ${params.appName}`,
  ].join("\n");

  const html = `
    <p>${greeting}</p>
    <p>Таны TORE баталгаажуулах код:</p>
    <p style="font-size:28px;letter-spacing:0.35em;font-weight:600">${params.otp}</p>
    <p style="color:#5A6B64;font-size:14px">${ttlLine}</p>
    <p style="color:#5A6B64;font-size:14px">Хэрэв та энэ бүртгэлийг үүсгээгүй бол энэ имэйлийг үл тооно уу.</p>
  `.trim();

  return { subject, text, html };
}
