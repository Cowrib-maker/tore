import Link from "next/link";
import { Scale } from "lucide-react";

import { logoutAction } from "@/application/actions/auth.actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  children: React.ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
  };
  title: string;
}

export function DashboardShell({ children, user, title }: DashboardShellProps) {
  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Scale className="size-5" />
            TORE
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.name ?? user.email}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </main>
    </div>
  );
}
