export default function LawyerExamLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10" role="status" aria-live="polite">
      <div className="h-6 w-48 animate-pulse rounded bg-[#0B1F3A]/10" />
      <div className="mt-4 h-4 w-full animate-pulse rounded bg-[#0B1F3A]/10" />
      <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-[#0B1F3A]/10" />
      <div className="mt-6 h-40 w-full animate-pulse rounded-2xl bg-[#0B1F3A]/10" />
      <span className="sr-only">…</span>
    </div>
  );
}
