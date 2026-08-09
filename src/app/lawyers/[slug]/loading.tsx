import { getDictionary } from "@/i18n/get-dictionary";

export default async function Loading() {
  const dict = await getDictionary();
  return (
    <div
      className="min-h-svh bg-[#FAFBFA]"
      role="status"
      aria-live="polite"
      aria-label={dict.marketplace.common.loading}
    >
      <div className="border-b border-[#0F3D33]/10 bg-white">
        <div className="mx-auto h-14 max-w-6xl px-5 sm:px-8" />
      </div>
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 sm:px-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="h-56 animate-pulse rounded-2xl border border-[#0F3D33]/10 bg-white" />
          <div className="h-40 animate-pulse rounded-2xl border border-[#0F3D33]/10 bg-white" />
        </div>
        <div className="space-y-4">
          <div className="h-48 animate-pulse rounded-xl border bg-white" />
          <div className="h-64 animate-pulse rounded-xl border bg-white" />
        </div>
      </div>
    </div>
  );
}
