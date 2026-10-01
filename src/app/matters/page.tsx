import Link from "next/link";

import { requirePageSession } from "@/application/common/session";
import { listMattersForActor } from "@/application/use-cases/matters/list-matters";
import { MattersShell } from "@/components/matters/matters-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActorContext } from "@/application/common/actor-context";
import type { UserRole } from "@/domain/enums";
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

export default async function MattersPage() {
  const session = await requirePageSession();
  const actor: ActorContext = {
    userId: session.user.id,
    role: session.user.role as UserRole,
  };
  const matters = await listMattersForActor(actor);

  return (
    <MattersShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0A0F14]">
            Миний хэргүүд
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Хэрэг тус бүрдээ AI-тай ажиллаж, явцаа хадгалаарай.
          </p>
        </div>
        <Link href="/matters/new" className={cn(buttonVariants({ size: "sm" }))}>
          + Шинэ хэрэг
        </Link>
      </div>

      {matters.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Одоогоор хэрэг үүсгээгүй байна.</CardTitle>
            <CardDescription>
              Эхний хэргээ үүсгээд AI-тай хамт ажиллаж эхэлье.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/matters/new"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Шинэ хэрэг үүсгэх
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {matters.map((matter) => (
            <Link key={matter.id} href={`/matters/${matter.id}`}>
              <Card className="transition hover:border-[#0B5CFF]/40">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{matter.title}</CardTitle>
                    <Badge variant={matter.status === "ACTIVE" ? "default" : "outline"}>
                      {matter.status === "ACTIVE" ? "Идэвхтэй" : "Архивласан"}
                    </Badge>
                  </div>
                  <CardDescription>
                    {TYPE_LABELS[matter.type] ?? matter.type} ·{" "}
                    {formatDate(matter.updatedAt)} шинэчлэгдсэн
                    {matter.conversationCount > 0
                      ? ` · ${matter.conversationCount} яриа`
                      : ""}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </MattersShell>
  );
}
