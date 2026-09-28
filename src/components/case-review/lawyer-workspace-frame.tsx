"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  CalendarClock,
  Database,
  FileText,
  FolderOpen,
  Gavel,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Scale,
  Search,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

import { logoutAction } from "@/application/actions/auth.actions";
import { ToreLogo } from "@/components/brand/tore-logo";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  exact?: boolean;
  /** No dedicated page exists yet — shown for structural fidelity to the
   * approved design, never clickable, never a fabricated destination. */
  disabled?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

/** Every enabled item below points at a real, working route. Disabled
 * items are visual-only placeholders for design groups that have no
 * dedicated page yet (see the Lawyer Workspace Stitch-alignment audit). */
function buildNavGroups(profileHref: string): NavGroup[] {
  return [
    {
      label: "Үндсэн",
      items: [
        { href: "/lawyer/workspace", label: "Нүүр", icon: LayoutGrid, exact: true },
      ],
    },
    {
      label: "Ажлын орчин",
      items: [
        { href: "/lawyer/workspace/cases", label: "Хэргүүд", icon: FolderOpen },
        { href: "/lawyer/workspace/cases", label: "Баримт бичиг", icon: FileText },
        { href: "#", label: "Клиентүүд", icon: Users, disabled: true },
        { href: "#", label: "Хуулийн судалгаа", icon: Gavel, disabled: true },
        { href: "#", label: "Шүүхийн практик", icon: Scale, disabled: true },
        { href: "#", label: "Загвар, маягт", icon: BookOpen, disabled: true },
      ],
    },
    {
      label: "Legal Intelligence",
      items: [
        { href: "/legal-ai", label: "Legal AI", icon: Sparkles },
        { href: "#", label: "Мэдлэгийн сан", icon: Database, disabled: true },
      ],
    },
    {
      label: "Үйлчилгээ",
      items: [
        { href: "/lawyer/bookings", label: "Захиалга", icon: CalendarClock },
        { href: "/lawyer/offerings", label: "Зөвлөгөө", icon: Scale },
        { href: "/lawyer/notifications", label: "Мэдэгдэл", icon: Bell },
        { href: profileHref, label: "Тохиргоо", icon: Settings },
      ],
    },
  ];
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.disabled) return false;
  if (item.exact) return pathname === item.href;
  if (item.label === "Баримт бичиг") return false;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

type FrameProps = {
  children: React.ReactNode;
  user: { name?: string | null; email?: string | null };
  profileHref: string;
  locale: Locale;
  languageLabel: string;
  signOutLabel: string;
  variant?: "page" | "workbench";
  unreadNotificationsCount?: number;
  /** Server-computed "YYYY.MM.DD Weekday" label — see lawyer/layout.tsx.
   * Rendered verbatim (never recomputed client-side) so it can never
   * hydration-mismatch. */
  todayLabel?: string;
};

export function LawyerWorkspaceFrame({
  children,
  user,
  profileHref,
  locale,
  languageLabel,
  signOutLabel,
  variant = "page",
  unreadNotificationsCount = 0,
  todayLabel,
}: FrameProps) {
  const [open, setOpen] = useState(false);
  const displayName = user.name?.trim() || user.email || "Хуульч";
  const workbench = variant === "workbench";
  const navGroups = buildNavGroups(profileHref);

  if (workbench) {
    return (
      <div
        className="flex h-svh min-h-0 overflow-hidden bg-[#F4F2EE]"
        data-testid="lawyer-ai-frame"
      >
        <aside className="hidden w-[232px] shrink-0 lg:flex">
          <WorkspaceSidebar
            navGroups={navGroups}
            displayName={displayName}
            profileHref={profileHref}
            locale={locale}
            languageLabel={languageLabel}
            signOutLabel={signOutLabel}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-[#0B1F3A]/8 bg-[#F4F2EE] px-4 py-3 lg:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Цэс нээх"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-5 text-[#0B1F3A]" />
            </Button>
            <Link href="/" aria-label="TORE нүүр хуудас">
              <ToreLogo
                tone="on-light"
                markClassName="size-7"
                wordmarkClassName="text-[0.95rem]"
                className="gap-2"
              />
            </Link>
            <span className="inline-flex h-9 w-9" aria-hidden />
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent
              side="left"
              showCloseButton
              className="w-[252px] border-0 bg-[#0B1F3A] p-0 sm:max-w-[252px]"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Ажлын талбарын цэс</SheetTitle>
              </SheetHeader>
              <WorkspaceSidebar
                navGroups={navGroups}
                displayName={displayName}
                profileHref={profileHref}
                locale={locale}
                languageLabel={languageLabel}
                signOutLabel={signOutLabel}
                onNavigate={() => setOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-svh flex-col bg-[#F4F2EE] lg:h-svh lg:min-h-0 lg:overflow-hidden"
      data-testid="lawyer-workspace-frame"
    >
      {/* Mobile top bar — existing working pattern, untouched below lg. */}
      <div className="flex items-center justify-between gap-3 border-b border-[#0B1F3A]/8 bg-[#F4F2EE] px-4 py-3 lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Цэс нээх"
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5 text-[#0B1F3A]" />
        </Button>
        <Link href="/" aria-label="TORE нүүр хуудас">
          <ToreLogo
            tone="on-light"
            markClassName="size-7"
            wordmarkClassName="text-[0.95rem]"
            className="gap-2"
          />
        </Link>
        <Link
          href="/lawyer/workspace/cases#create-case"
          className="inline-flex h-9 items-center rounded-lg bg-[#0B5CFF] px-3 text-sm font-medium text-white"
        >
          + Шинэ хэрэг
        </Link>
      </div>

      {/* Desktop top app header — Stitch's TopNavBar anchor. */}
      <header className="hidden h-14 shrink-0 items-center justify-between border-b border-[#0B1F3A]/8 bg-white px-6 lg:flex">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="TORE нүүр хуудас">
            <ToreLogo
              tone="on-light"
              markClassName="size-8"
              wordmarkClassName="text-[1rem] tracking-tight"
            />
          </Link>
        </div>

        <div className="hidden w-96 xl:block">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8A939D]" />
            <input
              disabled
              type="text"
              placeholder="Хэрэг хайх — тун удахгүй"
              aria-label="Хэрэг хайх — тун удахгүй"
              className="h-9 w-full cursor-not-allowed rounded-lg border border-[#0B1F3A]/10 bg-[#F8FAFC] pl-9 text-sm text-[#8A939D] placeholder:text-[#8A939D]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {todayLabel ? <TodayChip label={todayLabel} /> : null}
          <div className="mx-1 h-4 w-px bg-[#0B1F3A]/10" aria-hidden />
          <Link
            href="/lawyer/notifications"
            aria-label="Мэдэгдэл"
            className="relative flex size-8 items-center justify-center rounded-lg text-[#5C6570] transition hover:bg-[#F0F4F8] hover:text-[#0B1F3A]"
          >
            <Bell className="size-4" />
            {unreadNotificationsCount > 0 ? (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-[#0B5CFF] ring-2 ring-white" />
            ) : null}
          </Link>
          <Link
            href={profileHref}
            className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1 transition hover:bg-[#F0F4F8]"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#0B5CFF] text-[11px] font-semibold text-white">
              {initials(displayName)}
            </span>
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row lg:overflow-hidden">
        {/* Desktop sidebar — light Stitch surface, own scroll region. */}
        <aside className="hidden w-60 shrink-0 border-r border-[#0B1F3A]/8 bg-white lg:flex lg:flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-3">
            <Link
              href="/lawyer/workspace/cases#create-case"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] px-3 py-2 text-[13px] font-medium text-white transition hover:bg-[#132A47]"
            >
              <Plus className="size-4" />
              Шинэ хэрэг үүсгэх
            </Link>

            <DesktopNav navGroups={navGroups} />
          </div>

          <div className="border-t border-[#0B1F3A]/8 p-2.5">
            <Link
              href={profileHref}
              className="flex items-center gap-2.5 rounded-lg border border-[#0B1F3A]/8 bg-[#F8FAFC] p-2 transition hover:border-[#0B5CFF]/25"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#0B5CFF] text-xs font-semibold text-white">
                {initials(displayName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-[#0B1F3A]">
                  {displayName}
                </span>
                <span className="block truncate text-[10px] text-[#8A939D]">
                  Хуульч
                </span>
              </span>
            </Link>
            <form action={logoutAction} className="mt-1.5">
              <button
                type="submit"
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-[#5C6570] transition hover:bg-[#F0F4F8] hover:text-[#0B1F3A]"
              >
                <LogOut className="size-3.5" />
                {signOutLabel}
              </button>
            </form>
          </div>
        </aside>

        {/* Mobile nav drawer — same nav data, existing dark treatment. */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="left"
            showCloseButton
            className="w-[252px] border-0 bg-[#0B1F3A] p-0 sm:max-w-[252px]"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Ажлын талбарын цэс</SheetTitle>
            </SheetHeader>
            <WorkspaceSidebar
              navGroups={navGroups}
              displayName={displayName}
              profileHref={profileHref}
              locale={locale}
              languageLabel={languageLabel}
              signOutLabel={signOutLabel}
              onNavigate={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1 lg:min-h-0 lg:overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}

function TodayChip({ label }: { label: string }) {
  return (
    <span className="hidden items-center gap-1.5 rounded bg-[#F8FAFC] px-2 py-1 text-[11px] font-medium text-[#5C6570] sm:inline-flex">
      {label}
    </span>
  );
}

function DesktopNav({ navGroups }: { navGroups: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-4" aria-label="Ажлын талбар">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="px-2.5 text-[10px] font-bold tracking-wider text-[#8A939D] uppercase">
            {group.label}
          </p>
          <div className="mt-1 space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item);
              if (item.disabled) {
                return (
                  <span
                    key={`${item.href}-${item.label}`}
                    className="flex cursor-not-allowed items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] text-[#C3C9D1]"
                    aria-disabled="true"
                    title="Удахгүй"
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="size-4" />
                      {item.label}
                    </span>
                    <span className="text-[9px] font-semibold tracking-wide uppercase">
                      Удахгүй
                    </span>
                  </span>
                );
              }
              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                    active
                      ? "border-l-2 border-[#0B5CFF] bg-[#E8F0FE] text-[#0B5CFF]"
                      : "text-[#3F4852] hover:bg-[#F0F4F8] hover:text-[#0B1F3A]",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="size-4" />
                    {item.label}
                  </span>
                  {active ? (
                    <span className="size-1.5 rounded-full bg-[#0B5CFF]" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function WorkspaceSidebar({
  navGroups,
  displayName,
  profileHref,
  locale,
  languageLabel,
  signOutLabel,
  onNavigate,
}: {
  navGroups: NavGroup[];
  displayName: string;
  profileHref: string;
  locale: Locale;
  languageLabel: string;
  signOutLabel: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-svh w-full flex-col bg-[#0B1F3A] px-4 py-5 text-[#F7FAF8]">
      <Link
        href="/"
        aria-label="TORE нүүр хуудас"
        onClick={onNavigate}
        className="px-2 py-1"
      >
        <ToreLogo
          tone="on-dark"
          markClassName="size-8"
          wordmarkClassName="text-[1.05rem] tracking-[0.04em]"
          className="gap-2.5"
        />
      </Link>

      <nav className="mt-6 space-y-4 overflow-y-auto" aria-label="Ажлын талбар">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-[10px] font-bold tracking-wider text-white/40 uppercase">
              {group.label}
            </p>
            <div className="mt-1 space-y-1">
              {group.items.map((item) => (
                <SideLink
                  key={`${item.href}-${item.label}`}
                  item={item}
                  active={isActive(pathname, item)}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <div className="flex items-center gap-2 px-1">
          <LanguageSwitcher
            locale={locale}
            label={languageLabel}
            className="min-w-0 flex-1 justify-start text-[#F7FAF8]"
          />
          <ThemeToggle
            buttonClassName="border-white/12 bg-white/8 text-[#F7FAF8] hover:border-white/25 hover:bg-white/14"
          />
        </div>
        <Link
          href={profileHref}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl bg-white/8 px-3 py-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0B5CFF] text-xs font-semibold text-white">
            {initials(displayName)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">
              {displayName}
            </span>
            <span className="block text-xs text-white/55">Хуульч</span>
          </span>
        </Link>
        <div className="flex items-center gap-1 px-1">
          <Link
            href={profileHref}
            onClick={onNavigate}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-white/70 hover:bg-white/8 hover:text-white"
          >
            <Settings className="size-3.5" />
            Тохиргоо
          </Link>
          <form action={logoutAction} className="ml-auto">
            <button
              type="submit"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs text-white/70 hover:bg-white/8 hover:text-white"
            >
              <LogOut className="size-3.5" />
              {signOutLabel}
            </button>
          </form>
        </div>
        <p className="px-2 text-[10px] leading-4 text-white/35">
          © 2026 TORE. TORE Legal AI нь хуульч, өмгөөлөгчийг орлохгүй.
        </p>
      </div>
    </div>
  );
}

function SideLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  if (item.disabled) {
    return (
      <span
        className="flex cursor-not-allowed items-center justify-between rounded-xl px-3 py-2.5 text-[13px] text-white/30"
        aria-disabled="true"
      >
        <span className="flex items-center gap-2.5">
          <Icon className="size-4 shrink-0 opacity-70" />
          {item.label}
        </span>
        <span className="text-[9px] font-semibold tracking-wide uppercase">
          Удахгүй
        </span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-[#0B5CFF] text-white"
          : "text-white/70 hover:bg-white/8 hover:text-white",
      )}
    >
      <Icon className="size-4 shrink-0 opacity-90" />
      {item.label}
    </Link>
  );
}

function initials(value: string): string {
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Х";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}
