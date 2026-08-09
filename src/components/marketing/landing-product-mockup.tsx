import {
  BadgeCheck,
  CalendarDays,
  Star,
  Video,
} from "lucide-react";

import { ToreMark } from "@/components/brand/tore-logo";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/i18n/types";

type MockupCopy = Dictionary["landing"]["mockup"];

export function LandingProductMockup({
  copy,
  className,
}: {
  copy: MockupCopy;
  className?: string;
}) {
  const slots = [
    ["09:00", "10:30", "14:00"],
    ["11:00", "15:30", "—"],
    ["09:30", "13:00", "16:00"],
    ["10:00", "—", "15:00"],
    ["09:00", "12:00", "17:00"],
  ];

  return (
    <div className={cn("landing-product-panel relative", className)}>
      <div className="absolute -inset-10 -z-10 rounded-[2.75rem] bg-[radial-gradient(circle_at_35%_15%,rgba(15,61,51,0.1),transparent_55%),radial-gradient(circle_at_85%_75%,rgba(200,164,93,0.08),transparent_50%)]" />

      <div className="landing-shadow-lg overflow-hidden rounded-[1.35rem] border border-[#0F3D33]/10 bg-white">
        <div className="flex items-center gap-2 border-b border-[#0F3D33]/08 bg-[#F7FAF8]/95 px-4 py-3.5 backdrop-blur-sm">
          <span className="size-2.5 rounded-full bg-[#D4B5A8]" />
          <span className="size-2.5 rounded-full bg-[#D2C6A4]" />
          <span className="size-2.5 rounded-full bg-[#A8C4B4]" />
          <div className="ml-3 flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#0F3D33]/08 bg-white px-3 py-1.5 text-[11px] text-[#5A6B64] shadow-sm">
            <ToreMark className="size-3.5" decorative />
            <span className="truncate">{copy.urlBar}</span>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[1.12fr_0.88fr]">
          <div className="space-y-2.5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-[#5A6B64] uppercase">
                  {copy.matching}
                </p>
                <p className="mt-1 text-sm font-semibold tracking-tight text-[#0A0F14]">
                  {copy.matchingTitle}
                </p>
              </div>
              <span className="shrink-0 rounded-lg border border-[#0F3D33]/1 bg-[#F4F8F6] px-2.5 py-1 text-[11px] font-semibold text-[#0F3D33]">
                {copy.availableCount}
              </span>
            </div>

            {copy.rows.map((lawyer, index) => (
              <div
                key={lawyer.name}
                className={cn(
                  "rounded-xl border bg-white p-3.5 transition-shadow",
                  index === 0
                    ? "border-[#0F3D33]/25 shadow-[0_8px_20px_-14px_rgb(15_61_51/0.35)]"
                    : "border-[#0F3D33]/08",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold shadow-sm",
                      lawyer.tone,
                    )}
                  >
                    {lawyer.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold tracking-tight text-[#0A0F14]">
                        {lawyer.name}
                      </p>
                      <BadgeCheck className="size-3.5 shrink-0 fill-[#0F3D33] text-white" />
                    </div>
                    <p className="mt-0.5 text-xs text-[#5A6B64]">{lawyer.focus}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#3D4F48]">
                      {lawyer.rating ? (
                        <>
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3 fill-[#C8A45D] text-[#C8A45D]" />
                            {lawyer.rating}
                            {lawyer.reviews ? (
                              <span className="text-[#5A6B64]">
                                ({lawyer.reviews})
                              </span>
                            ) : null}
                          </span>
                          <span className="text-[#0F3D33]/25">·</span>
                        </>
                      ) : null}
                      <span>{lawyer.price}</span>
                      <span className="text-[#0F3D33]/25">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Video className="size-3" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-[#0F3D33]/08 bg-[#F7FAF8] p-3.5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A0F14]">
                  <CalendarDays className="size-3.5 text-[#0F3D33]" />
                  {copy.bookTitle}
                </p>
                <span className="text-[11px] text-[#5A6B64]">{copy.thisWeek}</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {copy.weekdays.map((day) => (
                  <div
                    key={day}
                    className="rounded-md border border-[#0F3D33]/08 bg-white py-1.5 text-center text-[10px] font-medium text-[#5A6B64]"
                  >
                    {day}
                  </div>
                ))}
                {slots.flatMap((daySlots, dayIndex) =>
                  daySlots.map((slot, slotIndex) => (
                    <div
                      key={`${dayIndex}-${slotIndex}`}
                      className={cn(
                        "rounded-md border py-2 text-center text-[10px]",
                        slot === "—"
                          ? "border-transparent text-[#0F3D33]/25"
                          : slot === "14:00" && dayIndex === 0
                            ? "border-[#0F3D33] bg-[#0F3D33] font-medium text-white shadow-sm"
                            : "border-[#0F3D33]/08 bg-white text-[#3D4F48]",
                      )}
                    >
                      {slot}
                    </div>
                  )),
                )}
              </div>
              <div className="mt-3 rounded-lg bg-[#0F3D33] px-3 py-2.5 text-center text-xs font-semibold text-white shadow-[0_8px_16px_-10px_rgb(15_61_51/0.55)]">
                {copy.confirm}
              </div>
            </div>

            <div className="rounded-xl border border-[#0F3D33]/15 bg-[#0F3D33] p-3.5 text-white shadow-[0_12px_28px_-16px_rgb(15_61_51/0.55)]">
              <div className="flex items-start gap-2.5">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 fill-white text-[#0F3D33]" />
                <div>
                  <p className="text-xs font-semibold">{copy.verifiedTitle}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/70">
                    {copy.verifiedBody}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
