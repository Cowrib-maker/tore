import Link from "next/link";
import {
  ChevronRight,
  FileSearch,
  FolderPlus,
  Gavel,
  MessageSquare,
  Scale,
  ShieldCheck,
} from "lucide-react";

import type { LawyerWorkspaceHomeView } from "@/application/use-cases/case-review";
import { LawyerWorkspaceAiComposer } from "@/components/case-review/lawyer-workspace-ai-composer";
import { LawyerWorkspaceCaseTable } from "@/components/case-review/lawyer-workspace-case-table";
import { LawyerWorkspaceRightRail } from "@/components/case-review/lawyer-workspace-right-rail";
import { formatRelativeMn } from "@/lib/format-relative-mn";

type QuickAction = {
  label: string;
  description: string;
  icon: typeof FolderPlus;
  href?: string;
};

/** Every enabled action points at a real, existing feature (case intake
 * form or the Legal AI flow). "Шүүхийн практик" has no dedicated
 * precedent-search feature yet, so it is shown disabled rather than
 * wired to something that doesn't exist. */
const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Шинэ хэрэг үүсгэх",
    description: "Хэргийн мэдээлэл бүртгэх",
    icon: FolderPlus,
    href: "/lawyer/workspace/cases#create-case",
  },
  {
    label: "Баримт шинжлэх",
    description: "PDF, Word баримтаа Legal AI-д хавсаргах",
    icon: FileSearch,
    href: "/legal-ai",
  },
  {
    label: "Хуулийн судалгаа",
    description: "Хууль, зүйл заалтын талаар асуух",
    icon: Gavel,
    href: "/legal-ai",
  },
  {
    label: "Шүүхийн практик",
    description: "Ижил төстэй шийдвэрийн хайлт",
    icon: Scale,
  },
];

type Props = {
  view: LawyerWorkspaceHomeView;
};

export function LawyerWorkspaceHome({ view }: Props) {
  const { cases, recentConversations, activity, summary, schedule, generatedAtMs } = view;
  // Computed once, server-side, and passed down as a plain prop — never
  // recomputed client-side — so every relative-time row in the case table
  // renders from the same stable reference and can never hydration-mismatch.
  const now = generatedAtMs;

  return (
    <div
      className="flex flex-col lg:h-full lg:min-h-0 lg:flex-row"
      data-testid="lawyer-workspace-home"
    >
      <main className="min-w-0 flex-1 space-y-4 px-4 py-6 sm:px-6 lg:min-h-0 lg:overflow-y-auto lg:px-7 lg:py-5">
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded bg-[#0B5CFF]/10 px-2 py-0.5">
            <ShieldCheck className="size-3.5 text-[#0B5CFF]" />
            <span className="text-[10px] font-bold tracking-wider text-[#0B5CFF] uppercase">
              TORE Lawyer Workspace
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0B1F3A] lg:text-[1.75rem]">
            Хэрэг, баримт, судалгаагаа нэг ухаалаг орчинд удирдана.
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5C6570]">
            Хуулийн ажлаа төвлөрүүлж, баримтаа шинжилж, TORE Legal AI-аас
            судалгаа авна уу.
          </p>
        </div>

        <LawyerWorkspaceAiComposer />

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <QuickActionCard key={action.label} action={action} />
          ))}
        </section>

        <LawyerWorkspaceCaseTable cases={cases} now={now} />

        <section className="rounded-xl border border-[#0B1F3A]/10 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-bold tracking-wide text-[#0B1F3A] uppercase">
              Сүүлийн AI ярианууд
            </h2>
            <Link
              href="/legal-ai"
              className="text-xs font-medium text-[#0B5CFF] hover:underline"
            >
              AI чат руу очих →
            </Link>
          </div>
          {recentConversations.length === 0 ? (
            <p className="text-sm text-[#5C6570]">
              Одоогоор хадгалагдсан яриа байхгүй.
            </p>
          ) : (
            <ul data-testid="workspace-recent-ai">
              {recentConversations.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/legal-ai?conversationId=${encodeURIComponent(item.id)}`}
                    className="flex items-center gap-3 border-b border-[#0B1F3A]/6 py-2.5 last:border-0"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#E8F0FE] text-[#0B5CFF]">
                      <MessageSquare className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[#0B1F3A]">
                        {item.title}
                      </span>
                      {item.caseTitle ? (
                        <span className="mt-0.5 block truncate text-[11px] text-[#8A939D]">
                          {item.caseTitle}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-[#8A939D]">
                      {formatRelativeMn(item.updatedAt)}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-[#C5CBC7]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <aside className="border-t border-[#0B1F3A]/8 bg-white p-4 lg:w-72 lg:min-h-0 lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
        <LawyerWorkspaceRightRail
          summary={summary}
          schedule={schedule}
          activity={activity}
        />
      </aside>
    </div>
  );
}

function QuickActionCard({ action }: { action: QuickAction }) {
  const Icon = action.icon;
  if (!action.href) {
    return (
      <div
        className="cursor-not-allowed rounded-xl border border-[#0B1F3A]/8 bg-[#F8FAFC] p-3 opacity-60"
        aria-disabled="true"
        title="Удахгүй"
      >
        <div className="mb-1.5 flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0B1F3A]/8 text-[#5C6570]">
            <Icon className="size-4" />
          </span>
          <h3 className="text-[13px] font-semibold text-[#0B1F3A]">
            {action.label}
          </h3>
        </div>
        <p className="pl-0.5 text-[11px] text-[#8A939D]">
          {action.description} · Удахгүй
        </p>
      </div>
    );
  }
  return (
    <Link
      href={action.href}
      className="group rounded-xl border border-[#0B1F3A]/8 bg-white p-3 transition-all hover:border-[#0B5CFF] hover:shadow-sm"
    >
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0B5CFF]/10 text-[#0B5CFF] transition-colors group-hover:bg-[#0B5CFF] group-hover:text-white">
          <Icon className="size-4" />
        </span>
        <h3 className="text-[13px] font-semibold text-[#0B1F3A]">
          {action.label}
        </h3>
      </div>
      <p className="pl-0.5 text-[11px] text-[#8A939D]">{action.description}</p>
    </Link>
  );
}
