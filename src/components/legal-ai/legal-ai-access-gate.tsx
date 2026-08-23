import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { LegalAiAccessGate } from "@/components/legal-ai/interpret-legal-ai-chat-access";
import {
  loginHrefForLegalAi,
  registerClientHrefForLegalAi,
} from "@/domain/services/rbac";
import { cn } from "@/lib/utils";

export function LegalAiAccessGateCard({ gate }: { gate: LegalAiAccessGate }) {
  const loginHref = loginHrefForLegalAi(gate.question);
  const registerHref = registerClientHrefForLegalAi(gate.question);

  return (
    <div
      role="dialog"
      className="mt-5 rounded-xl border border-[#0B1F3A]/15 bg-white px-4 py-4 text-sm text-[#3F4852] shadow-[0_10px_24px_-20px_rgba(11,31,58,0.45)]"
    >
      <p className="font-medium text-[#0A0F14]">{gate.message}</p>
      {gate.kind === "auth" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={loginHref} className={cn(buttonVariants({ size: "sm" }))}>
            Нэвтрэх
          </Link>
          <Link
            href={registerHref}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            Бүртгүүлэх
          </Link>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {gate.checkoutError ? (
            <p className="text-red-700">{gate.checkoutError}</p>
          ) : null}
          {gate.checkout?.qrImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={
                gate.checkout.qrImage.startsWith("data:")
                  ? gate.checkout.qrImage
                  : `data:image/png;base64,${gate.checkout.qrImage}`
              }
              alt="QPay QR"
              className="h-40 w-40 rounded-md border border-[#D9DEE5]"
            />
          ) : null}
          {gate.checkout?.shortUrl ? (
            <a
              href={gate.checkout.shortUrl}
              className="text-[#0B1F3A] underline"
              target="_blank"
              rel="noreferrer"
            >
              QPay-ээр төлөх
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
