"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Briefcase,
  Calendar,
  FileText,
  FolderOpen,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  Scale,
  Settings,
} from "lucide-react";

import { logoutAction } from "@/application/actions/auth.actions";
import { ToreLogo } from "@/components/brand/tore-logo";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
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
};

const PRIMARY_NAV: NavItem[] = [
  { href: "/lawyer/dashboard", label: "Тойм", icon: LayoutGrid },
  {
    href: "/lawyer/workspace",
    label: "Ажлын талбар",
    icon: Briefcase,
    exact: true,
  },
  { href: "/lawyer/workspace/cases", label: "Хэргүүд", icon: FolderOpen },
  { href: "/legal-ai", label: "AI чат", icon: MessageSquare },
  { href: "/lawyer/workspace/cases", label: "Баримт бичиг", icon: FileText },
];

const SECONDARY_NAV: NavItem[] = [
  { href: "/lawyer/offerings", label: "Үйлчилгээ", icon: Scale },
  { href: "/lawyer/bookings", label: "Зөвлөгөөний хүсэлт", icon: Calendar },
  { href: "/lawyer/notifications", label: "Мэдэгдэл", icon: Bell },
];

function isActive(pathname: string, item: NavItem): boolean {
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
};

export function LawyerWorkspaceFrame({
  children,
  user,
  profileHref,
  locale,
  languageLabel,
  signOutLabel,
  variant = "page",
}: FrameProps) {
  const [open, setOpen] = useState(false);
  const displayName = user.name?.trim() || user.email || "Хуульч";
  const workbench = variant === "workbench";

  return (
    <div
      className={cn(
        "flex bg-[#F4F2EE]",
        workbench ? "h-svh min-h-0 overflow-hidden" : "min-h-svh",
      )}
      data-testid={workbench ? "lawyer-ai-frame" : "lawyer-workspace-frame"}
    >
      <aside
        className={cn(
          "hidden shrink-0 lg:flex",
          workbench ? "w-[232px]" : "w-[252px]",
        )}
      >
        <WorkspaceSidebar
          displayName={displayName}
          profileHref={profileHref}
          locale={locale}
          languageLabel={languageLabel}
          signOutLabel={signOutLabel}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
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
          {workbench ? (
            <span className="inline-flex h-9 w-9" aria-hidden />
          ) : (
            <Link
              href="/lawyer/workspace/cases#create-case"
              className="inline-flex h-9 items-center rounded-lg bg-[#0F3D33] px-3 text-sm font-medium text-white"
            >
              + Шинэ хэрэг
            </Link>
          )}
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
              displayName={displayName}
              profileHref={profileHref}
              locale={locale}
              languageLabel={languageLabel}
              signOutLabel={signOutLabel}
              onNavigate={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <main
          className={cn(
            "min-w-0 flex-1",
            workbench ? "flex min-h-0 flex-col overflow-hidden" : "overflow-x-hidden",
          )}
        >
          {workbench ? (
            children
          ) : (
            <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function WorkspaceSidebar({
  displayName,
  profileHref,
  locale,
  languageLabel,
  signOutLabel,
  onNavigate,
}: {
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

      <nav className="mt-8 space-y-1" aria-label="Ажлын талбар">
        {PRIMARY_NAV.map((item) => (
          <SideLink
            key={`${item.href}-${item.label}`}
            item={item}
            active={isActive(pathname, item)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="mx-2 my-5 h-px bg-white/10" />

      <nav className="space-y-1" aria-label="Бусад">
        {SECONDARY_NAV.map((item) => (
          <SideLink
            key={item.href}
            item={item}
            active={isActive(pathname, item)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <div className="px-1">
          <LanguageSwitcher
            locale={locale}
            label={languageLabel}
            className="w-full justify-start text-[#F7FAF8]"
          />
        </div>
        <Link
          href={profileHref}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl bg-white/8 px-3 py-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0F3D33] text-xs font-semibold text-white">
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
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-[#0F3D33] text-white"
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
