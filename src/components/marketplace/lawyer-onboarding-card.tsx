import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  LawyerOnboarding,
  OnboardingItem,
  OnboardingItemKey,
} from "@/domain/services/lawyer-onboarding";

export type LawyerOnboardingCopy = {
  title: string;
  help: string;
  groupVerification: string;
  groupListing: string;
  groupRecommended: string;
  visibleNow: string;
  items: Record<OnboardingItemKey, string>;
};

/** Where an unfinished item is completed — existing screens only. */
const ITEM_HREF: Record<OnboardingItemKey, string> = {
  license: "/lawyer/profile#verification",
  approved: "/lawyer/profile#verification",
  offering: "/lawyer/offerings",
  optedIn: "/lawyer/dashboard",
  headline: "/lawyer/profile",
  bio: "/lawyer/profile",
  years: "/lawyer/profile",
  city: "/lawyer/profile",
  education: "/lawyer/profile",
  photo: "/lawyer/profile",
  practiceAreas: "/lawyer/profile#practice",
  languages: "/lawyer/profile#practice",
  schedule: "/lawyer/profile#schedule",
};

function Group({
  title,
  items,
  labels,
}: {
  title: string;
  items: OnboardingItem[];
  labels: Record<OnboardingItemKey, string>;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((item) => (
          <li
            key={item.key}
            className={item.done ? "text-foreground" : "text-muted-foreground"}
          >
            <span aria-hidden>{item.done ? "✓" : "○"}</span>{" "}
            <span className="sr-only">{item.done ? "done" : "todo"}: </span>
            {item.done ? (
              labels[item.key]
            ) : (
              <Link
                href={ITEM_HREF[item.key]}
                className="underline-offset-4 hover:underline"
              >
                {labels[item.key]}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Three clearly separated lists: what verification needs, what the public
 * directory needs (the existing gate), and optional profile content.
 */
export function LawyerOnboardingCard({
  onboarding,
  copy,
}: {
  onboarding: LawyerOnboarding;
  copy: LawyerOnboardingCopy;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{copy.title}</CardTitle>
          {onboarding.isPubliclyVisible ? (
            <Badge>{copy.visibleNow}</Badge>
          ) : null}
        </div>
        <CardDescription>{copy.help}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Group
          title={copy.groupVerification}
          items={onboarding.forVerification}
          labels={copy.items}
        />
        <Group
          title={copy.groupListing}
          items={onboarding.forPublicListing}
          labels={copy.items}
        />
        <Group
          title={copy.groupRecommended}
          items={onboarding.recommended}
          labels={copy.items}
        />
      </CardContent>
    </Card>
  );
}
