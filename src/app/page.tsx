import Link from "next/link";
import { ArrowRight, Scale, Shield, Users } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Users,
    title: "Find licensed lawyers",
    description:
      "Browse verified legal professionals across practice areas in Mongolia.",
  },
  {
    icon: Shield,
    title: "Book with confidence",
    description:
      "Secure payments, transparent pricing in MNT, and review-backed trust.",
  },
  {
    icon: Scale,
    title: "Built for Mongolia",
    description:
      "Bilingual support, local practice areas, and marketplace compliance built in.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Scale className="size-5" />
            TORE
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }))}>
              Sign in
            </Link>
            <Link href="/register/client" className={cn(buttonVariants())}>
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Legal Marketplace · Mongolia
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Connect with licensed lawyers you can trust
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              TORE is Mongolia&apos;s legal marketplace — discover verified lawyers,
              book consultations, and manage your legal needs online.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/register/client"
                className={cn(buttonVariants({ size: "lg" }), "gap-2")}
              >
                Find a lawyer
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/register/lawyer"
                className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
              >
                Join as a lawyer
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="border-0 bg-transparent shadow-none">
                <CardHeader>
                  <feature.icon className="mb-2 size-8" />
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
