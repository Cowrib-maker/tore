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
      <div className="absolute -inset-10 -z-10 rounded-[2.75rem] bg-[radial-gradient(circle_at_42%_22%,rgba(15,61,51,0.045),transparent_60%),radial-gradient(circle_at_78%_78%,rgba(200,164,93,0.035),transparent_54%)]" />

      {/* Single product screenshot frame — one elevated surface */}
      <div className="landing-shadow-md overflow-hidden rounded-[1.25rem] border border-[#0F3D33]/8 bg-white">
        <div className="flex items-center gap-2 border-b border-[#0F3D33]/6 bg-[#F7FAF8]/90 px-4 py-3">
          <span className="size-2 rounded-full bg-[#D4B5A8]/90" />
          <span className="size-2 rounded-full bg-[#D2C6A4]/90" />
          <span className="size-2 rounded-full bg-[#A8C4B4]/90" />
          <div className="ml-3 flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[#0F3D33]/6 bg-white/90 px-3 py-1.5 text-[11px] text-[#5A6B64]">
            <ToreMark className="size-3.5 opacity-90" decorative />
            <span className="truncate">{copy.urlBar}</span>
          </div>
        </div>

        <div className="grid md:grid-cols-[1.12fr_0.88fr] md:divide-x md:divide-[#0F3D33]/6">
          <div className="p-3.5 sm:p-4">
            <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-[#5A6B64]/90 uppercase">
                  {copy.matching}
                </p>
                <p className="mt-1 text-sm font-semibold tracking-tight text-[#0A0F14]/90">
                  {copy.matchingTitle}
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-[#0F3D33]/8 bg-[#F4F8F6]/80 px-2 py-0.5 text-[10px] font-semibold text-[#0F3D33]/85">
                {copy.availableCount}
              </span>
            </div>

            <div className="divide-y divide-[#0F3D33]/6 overflow-hidden rounded-lg border border-[#0F3D33]/7 bg-[#FAFBFA]/60">
              {copy.rows.map((lawyer, index) => (
                <div
                  key={lawyer.name}
                  className={cn(
                    "px-3 py-2.5",
                    index === 0 ? "bg-[rgb(15_61_51/0.035)]" : "bg-transparent",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold opacity-90",
                        lawyer.tone,
                      )}
                    >
                      {lawyer.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold tracking-tight text-[#0A0F14]/90">
                          {lawyer.name}
                        </p>
                        <BadgeCheck className="size-3 shrink-0 fill-[#0F3D33]/85 text-white" />
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#5A6B64]/90">
                        {lawyer.focus}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[#3D4F48]/90">
                        {lawyer.rating ? (
                          <>
                            <span className="inline-flex items-center gap-1">
                              <Star className="size-2.5 fill-[#C8A45D] text-[#C8A45D]" />
                              {lawyer.rating}
                              {lawyer.reviews ? (
                                <span className="text-[#5A6B64]/85">
                                  ({lawyer.reviews})
                                </span>
                              ) : null}
                            </span>
                            <span className="text-[#0F3D33]/20">·</span>
                          </>
                        ) : null}
                        <span>{lawyer.price}</span>
                        <span className="text-[#0F3D33]/20">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Video className="size-2.5 opacity-80" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-0 border-t border-[#0F3D33]/6 p-3.5 sm:p-4 md:border-t-0">
            <div className="rounded-lg bg-[#F7FAF8]/80 p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0A0F14]/90">
                  <CalendarDays className="size-3.5 text-[#0F3D33]/85" />
                  {copy.bookTitle}
                </p>
                <span className="text-[10px] text-[#5A6B64]/90">
                  {copy.thisWeek}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {copy.weekdays.map((day) => (
                  <div
                    key={day}
                    className="rounded py-1 text-center text-[10px] font-medium text-[#5A6B64]/85"
                  >
                    {day}
                  </div>
                ))}
                {slots.flatMap((daySlots, dayIndex) =>
                  daySlots.map((slot, slotIndex) => (
                    <div
                      key={`${dayIndex}-${slotIndex}`}
                      className={cn(
                        "rounded py-1.5 text-center text-[10px]",
                        slot === "—"
                          ? "text-[#0F3D33]/20"
                          : slot === "14:00" && dayIndex === 0
                            ? "bg-[#0F3D33]/90 font-medium text-white"
                            : "bg-white/70 text-[#3D4F48]/90",
                      )}
                    >
                      {slot}
                    </div>
                  )),
                )}
              </div>
              <div className="mt-2.5 rounded-md bg-[#0F3D33]/90 px-3 py-2 text-center text-[11px] font-semibold text-white">
                {copy.confirm}
              </div>
            </div>

            <div className="mt-2.5 rounded-lg bg-[#0F3D33]/88 p-3 text-white">
              <div className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 size-3.5 shrink-0 fill-white/95 text-[#0F3D33]" />
                <div>
                  <p className="text-[11px] font-semibold opacity-95">
                    {copy.verifiedTitle}
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-white/65">
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
