import Link from "next/link";
import { notFound } from "next/navigation";

import type { ActorContext } from "@/application/common/actor-context";
import { requirePageSession } from "@/application/common/session";
import { loadMatterOverviewForActor } from "@/application/use-cases/matters/matter-overview";
import { MattersShell } from "@/components/matters/matters-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserRole } from "@/domain/enums";
import { DomainError } from "@/domain/errors/domain-error";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  GENERAL: "Ерөнхий",
  LITIGATION: "Маргаан, шүүх",
  CONTRACT: "Гэрээ",
  EMPLOYMENT: "Хөдөлмөр",
  FAMILY: "Гэр бүл",
  CRIMINAL: "Эрүүгийн",
  ADMINISTRATIVE: "Захиргааны",
};

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export default async function MatterOverviewPage({
  params,
}: {
  params: Promise<{ matterId: string }>;
}) {
  const { matterId } = await params;
  const session = await requirePageSession();
  const actor: ActorContext = {
    userId: session.user.id,
    role: session.user.role as UserRole,
  };

  // A missing Matter and one owned by someone else both 404 identically —
  // a guessed id must never distinguish "doesn't exist" from "not yours".
  let overview;
  try {
    overview = await loadMatterOverviewForActor(actor, matterId);
  } catch (error) {
    if (error instanceof DomainError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) {
      notFound();
    }
    throw error;
  }

  return (
    <MattersShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <Link href="/matters" className="text-sm text-muted-foreground hover:underline">
            ← Миний хэргүүд
          </Link>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[#0A0F14]">
              {overview.title}
            </h1>
            <Badge variant={overview.status === "ACTIVE" ? "default" : "outline"}>
              {overview.status === "ACTIVE" ? "Идэвхтэй" : "Архивласан"}
            </Badge>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Тойм</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {overview.description ? (
              <p className="text-sm leading-6 text-[#3D4A57] whitespace-pre-wrap">
                {overview.description}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Тайлбар оруулаагүй байна.</p>
            )}
            <dl className="grid grid-cols-2 gap-4 border-t border-[#0B1F3A]/8 pt-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Төрөл</dt>
                <dd className="mt-0.5 font-medium">
                  {TYPE_LABELS[overview.type] ?? overview.type}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Төлөв</dt>
                <dd className="mt-0.5 font-medium">
                  {overview.status === "ACTIVE" ? "Идэвхтэй" : "Архивласан"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Үүсгэсэн</dt>
                <dd className="mt-0.5 font-medium">{formatDate(overview.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Шинэчилсэн</dt>
                <dd className="mt-0.5 font-medium">{formatDate(overview.updatedAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {overview.conversationCount > 0
                ? `Энэ хэрэгт ${overview.conversationCount} AI яриа холбогдсон байна.`
                : "Энэ хэрэгт одоогоор AI яриа холбогдоогүй байна."}
            </p>
            <Link
              href={`/matters/${overview.id}/ai`}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              AI-тай ажиллах
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Баримт бичиг</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Баримт бичгийн шинжилгээ удахгүй.
            </p>
          </CardContent>
        </Card>
      </div>
    </MattersShell>
  );
}
