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
      <div className="mx-auto max-w-6xl space-y-6 px-5 py-10 sm:px-8">
        <div className="h-8 w-72 animate-pulse rounded-md bg-[#0F3D33]/10" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-[#0F3D33]/8" />
        <div className="h-28 animate-pulse rounded-2xl border border-[#0F3D33]/10 bg-white" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl border border-[#0F3D33]/10 bg-white"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
