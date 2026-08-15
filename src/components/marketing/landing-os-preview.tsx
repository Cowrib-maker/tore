import { LandingLegalAiComposer } from "@/components/marketing/landing-legal-ai-composer";
import type { Dictionary } from "@/i18n/types";

export function LandingOsPreview({
  t,
  composerMode,
  dashboardHref,
}: {
  t: Dictionary["landing"];
  composerMode: "guest" | "client" | "other";
  dashboardHref: string;
}) {
  return (
    <div className="landing-product-panel overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white shadow-[0_24px_60px_rgba(11,31,58,0.08)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#0B1F3A]/8 bg-[#F8FAFC] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#0B1F3A]/20" />
          <span className="size-2 rounded-full bg-[#0B1F3A]/20" />
          <span className="size-2 rounded-full bg-[#0B1F3A]/20" />
        </div>

        <span className="text-[11px] font-semibold text-[#0B1F3A]">
          TORE Legal AI
        </span>

        <span className="text-[10px] text-[#7B8490]">
          Хууль зүйн туслах
        </span>
      </div>

      <div className="bg-white p-5">
        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7B8490]">
            TORE Legal AI
          </p>

          <h3 className="mt-1.5 text-lg font-semibold text-[#0A0F14]">
            Хууль зүйн асуудлаа бичнэ үү
          </h3>
        </div>

        {/* User */}
        <div className="flex justify-end">
          <div className="max-w-[88%] rounded-2xl rounded-br-md bg-[#0B1F3A] px-4 py-3 text-[12px] leading-5 text-white">
            Би байгууллагатай байгуулсан гэрээгээ цуцлах хүсэлтэй байгаа.
            Ямар эрх, үүрэгтэйгээ мэдмээр байна.
          </div>
        </div>

        {/* AI */}
        <div className="mt-5 flex gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#EEF3F8] text-xs font-bold text-[#0B1F3A]">
            T
          </div>

          <div className="flex-1">
            <p className="mb-2 text-[10px] font-semibold text-[#0B1F3A]">
              TORE Legal AI
            </p>

            <div className="rounded-2xl rounded-tl-md border border-[#0B1F3A]/8 bg-[#F8FAFC] p-4">
              <p className="text-[12px] leading-6 text-[#3F4852]">
                Таны нөхцөл байдлыг үнэлэхэд гэрээ цуцлах үндэслэл,
                талуудын эрх, үүрэг болон гэрээний холбогдох зохицуулалтыг
                шалгах шаардлагатай байна.
              </p>

              <div className="mt-4 rounded-lg border border-[#C8A45D]/25 bg-[#FFFDF7] p-3">
                <p className="text-[10px] font-semibold text-[#8A6A2F]">
                  Эх сурвалж
                </p>

                <p className="mt-1 text-[10px] leading-5 text-[#6B6250]">
                  Монгол Улсын Иргэний хууль • Гэрээний эрх зүйн зохицуулалт
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* AI Output */}
        <div className="mt-5 space-y-2">
          <div className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[11px]">
            ✓ Холбогдох хууль тогтоомж
          </div>

          <div className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[11px]">
            ✓ Боломжит дараагийн алхмууд
          </div>

          <div className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[11px]">
            ✓ Эрсдэлийн урьдчилсан үнэлгээ
          </div>
        </div>

        <LandingLegalAiComposer
          placeholder={t.aiComposerPlaceholder}
          submitLabel={t.aiComposerSubmit}
          guestHint={t.aiComposerGuestHint}
          mode={composerMode}
          dashboardHref={dashboardHref}
        />
      </div>
    </div>
  );
}