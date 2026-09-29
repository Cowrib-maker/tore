import {
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CreditCard,
  FolderOpen,
  Globe,
  LayoutDashboard,
  LayoutGrid,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
  Users,
  Wrench,
} from "lucide-react";

/**
 * Shared, serializable icon registry for WorkspaceShell nav items.
 *
 * WorkspaceShell is a Server Component; WorkspaceNavLink (which actually
 * renders the icon) is a Client Component. A LucideIcon component
 * reference is a function, and functions cannot cross a Server -> Client
 * RSC boundary as a prop ("Functions cannot be passed directly to Client
 * Components unless you explicitly expose it by marking it with
 * 'use server'"). Server-side callers (admin/layout.tsx,
 * lawyer-app-chrome.tsx, ...) pass a serializable string key instead
 * (WorkspaceIconKey); only WorkspaceNavLink resolves that key to the
 * actual icon component, inside the Client Component that renders it.
 *
 * One shared registry for every WorkspaceShell consumer — do not add a
 * second, per-context icon map; add new keys here instead.
 */
export const WORKSPACE_ICONS = {
  "layout-dashboard": LayoutDashboard,
  "layout-grid": LayoutGrid,
  "folder-open": FolderOpen,
  briefcase: Briefcase,
  "calendar-clock": CalendarClock,
  "credit-card": CreditCard,
  bell: Bell,
  sparkles: Sparkles,
  "building-2": Building2,
  "shield-check": ShieldCheck,
  users: Users,
  tags: Tags,
  settings: Settings,
  globe: Globe,
  "scroll-text": ScrollText,
  wrench: Wrench,
} as const;

export type WorkspaceIconKey = keyof typeof WORKSPACE_ICONS;
