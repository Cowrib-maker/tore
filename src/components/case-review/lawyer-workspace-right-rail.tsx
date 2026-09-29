import Link from "next/link";
import { CalendarClock, Search } from "lucide-react";

import type {
  LawyerWorkspaceActivityItem,
  LawyerWorkspaceSchedule,
  LawyerWorkspaceSummary,
} from "@/application/use-cases/case-review";
import {
  formatRelativeMn,
  formatTimeMn,
} from "@/lib/format-relative-mn";

type Props = {
  summary: LawyerWorkspaceSummary;
  schedule: LawyerWorkspaceSchedule;
  activity: LawyerWorkspaceActivityItem[];
};

/**
 * Every number and event here comes from view.summary / view.schedule /
 * view.activity — all real repository-backed data. Stitch sections with
 * no trustworthy real source (court-registry status, time tracking) are
 * intentionally omitted rather than faked.
 */
export function LawyerWorkspaceRightRail({ summary, schedule, activity }: Props) {
  // schedule.todayLabel is the single canonical "today" value for the whole
  // workspace (lawyer's own timezone, from loadLawyerWorkspaceHome) — this
  // panel must never compute its own, or it can silently disagree with the
  // todaysConfirmedCount tile rendered right below it.
  const today = schedule.todayLabel;

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-[#0B1F3A]">Өнөөдрийн тойм</h3>
          <span className="text-[10px] text-[#8A939D]">{today}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Хүлээгдэж буй хүсэлт"
            value={schedule.pendingBookingCount}
            unit="хүсэлт"
          />
          <StatTile
            label="Өнөөдрийн уулзалт"
            value={schedule.todaysConfirmedCount}
            unit="уулзалт"
            accent="text-[#0B5CFF]"
          />
          <StatTile
            label="Шинжлээгүй хэрэг"
            value={summary.notAnalyzedCaseCount}
            unit="хэрэг"
            accent="text-amber-600"
          />
          <StatTile
            label="Баримт бичиг"
            value={summary.documentCount}
            unit="файл"
            accent="text-emerald-600"
          />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-[#0B1F3A]">Удахгүй болох</h3>
          <CalendarClock className="size-4 text-[#8A939D]" />
        </div>
        {schedule.upcoming.length === 0 ? (
          <p className="rounded-lg border border-[#0B1F3A]/8 bg-[#F8FAFC] p-2.5 text-[11px] text-[#8A939D]">
            Ойрын товлосон цаг алга.
          </p>
        ) : (
          <div className="space-y-2">
            {schedule.upcoming.map((booking) => (
              <div
                key={booking.id}
                className="rounded-lg border border-[#0B1F3A]/8 border-l-4 border-l-[#0B5CFF] bg-[#F8FAFC] p-2.5"
              >
                <div className="flex items-center justify-between text-[10px] font-semibold text-[#0B5CFF]">
                  <span>
                    {formatTimeMn(booking.scheduledStartAt)} –{" "}
                    {formatTimeMn(booking.scheduledEndAt)}
                  </span>
                  <span className="rounded bg-[#0B5CFF]/10 px-1.5 py-0.5">
                    Зөвлөгөө
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12px] font-bold leading-snug text-[#0B1F3A]">
                  {booking.issueSummary}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-bold text-[#0B1F3A]">
          Сүүлийн үйл ажиллагаа
        </h3>
        {activity.length === 0 ? (
          <p className="text-[11px] text-[#8A939D]">Үйл ажиллагаа алга.</p>
        ) : (
          <div
            data-testid="workspace-activity"
            className="relative space-y-2.5 border-l border-[#0B1F3A]/10 pl-3 text-[11px]"
          >
            {activity.slice(0, 6).map((item) => (
              <div key={item.id} className="relative">
                <span className="absolute top-1 -left-[17px] size-2 rounded-full bg-[#0B5CFF]" />
                <p className="leading-snug font-medium text-[#0B1F3A]">
                  {item.title}
                </p>
                {item.caseTitle ? (
                  <p className="mt-0.5 truncate text-[10px] text-[#8A939D]">
                    {item.caseTitle}
                  </p>
                ) : null}
                <p className="mt-0.5 text-[10px] text-[#8A939D]">
                  {formatRelativeMn(item.at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="border-t border-[#0B1F3A]/8 pt-3">
        <Link
          href="/legal-ai"
          className="flex w-full items-center justify-between rounded-lg border border-[#0B1F3A]/10 bg-[#F8FAFC] px-2.5 py-1.5 text-[12px] font-medium text-[#0B1F3A] transition-colors hover:bg-[#E8F0FE]"
        >
          <span className="flex items-center gap-2">
            <Search className="size-4 text-[#0B5CFF]" />
            Legal AI-аас хайх
          </span>
        </Link>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  unit,
  accent = "text-[#0B1F3A]",
}: {
  label: string;
  value: number;
  unit: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-[#0B1F3A]/8 bg-[#F8FAFC] p-2.5">
      <p className="text-[10px] text-[#8A939D]">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`text-[20px] font-bold ${accent}`}>{value}</span>
        <span className="text-[10px] text-[#8A939D]">{unit}</span>
      </div>
    </div>
  );
}
