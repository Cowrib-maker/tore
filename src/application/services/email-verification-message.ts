export function buildEmailVerificationMessage(params: {
  appName: string;
  toName: string | null;
  verifyUrl: string;
  ttlHours: number;
}): { subject: string; text: string; html: string } {
  const greeting = params.toName ? `Dear ${params.toName},` : "Dear client,";
  const subject = `Confirm your ${params.appName} email address`;
  const text = [
    greeting,
    "",
    `Please confirm the email address associated with your ${params.appName} account by opening the link below:`,
    params.verifyUrl,
    "",
    `This link expires in ${params.ttlHours} hours.`,
    "",
    "If you did not create this account, you may disregard this message.",
    "",
    `— ${params.appName}`,
  ].join("\n");

  const html = `
    <p>${greeting}</p>
    <p>Please confirm the email address associated with your <strong>${params.appName}</strong> account:</p>
    <p><a href="${params.verifyUrl}">Confirm email address</a></p>
    <p style="color:#5A6B64;font-size:14px">Or paste this URL into your browser:<br/>${params.verifyUrl}</p>
    <p style="color:#5A6B64;font-size:14px">This link expires in ${params.ttlHours} hours.</p>
    <p style="color:#5A6B64;font-size:14px">If you did not create this account, you may disregard this message.</p>
  `.trim();

  return { subject, text, html };
}
