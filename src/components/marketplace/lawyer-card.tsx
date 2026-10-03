import Link from "next/link";
import { MapPin, Video } from "lucide-react";

import { RatingSummary } from "@/components/marketplace/rating-summary";
import { VerifiedBadge } from "@/components/marketplace/verified-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LawyerCardData = {
  slug: string;
  displayName: string;
  imageUrl: string | null;
  headline: string | null;
  verificationStatus: string;
  yearsOfExperience: number | null;
  averageRating: number | null;
  reviewCount: number;
  city: string | null;
  practiceAreaNames: string[];
  offersOnline: boolean;
  minPriceMnt: number | null;
};

export type LawyerCardCopy = {
  verified: string;
  fallbackTitle: string;
  yearsExperience: string; // "{n} жилийн ..."
  ratingCount: string; // "{count} үнэлгээ"
  online: string;
  fromPrice: string; // "Эхлэх үнэ {price} ₮"
  viewOfferings: string;
  viewProfile: string;
  getConsultation: string;
};

/**
 * Directory card. Every line is conditional on a real persisted value: no
 * placeholder rating, price, experience or specialization is ever rendered.
 */
export function LawyerCard({
  lawyer,
  copy,
}: {
  lawyer: LawyerCardData;
  copy: LawyerCardCopy;
}) {
  const profileHref = `/lawyers/${lawyer.slug}`;
  return (
    <article className="ds-surface flex flex-col p-5 transition-colors hover:border-brand/28">
      <div className="flex items-start gap-3">
        {lawyer.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lawyer.imageUrl}
            alt=""
            className="size-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-lg font-semibold text-brand"
          >
            {lawyer.displayName.trim().charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">
            <Link href={profileHref} className="hover:underline">
              {lawyer.displayName}
            </Link>
          </h2>
          <div className="mt-1">
            <VerifiedBadge
              status={lawyer.verificationStatus}
              label={copy.verified}
            />
          </div>
          <p className="mt-1.5 text-sm text-brand-muted">
            {lawyer.headline ?? copy.fallbackTitle}
          </p>
        </div>
      </div>

      {lawyer.practiceAreaNames.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {lawyer.practiceAreaNames.slice(0, 3).map((name) => (
            <span key={name} className="ds-chip">
              {name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-brand-muted">
        {lawyer.yearsOfExperience != null && (
          <span>
            {copy.yearsExperience.replace("{n}", String(lawyer.yearsOfExperience))}
          </span>
        )}
        <RatingSummary
          average={lawyer.averageRating}
          count={lawyer.reviewCount}
          countLabel={copy.ratingCount}
        />
        {lawyer.city && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {lawyer.city}
          </span>
        )}
        {lawyer.offersOnline && (
          <span className="inline-flex items-center gap-1">
            <Video className="size-3.5" aria-hidden />
            {copy.online}
          </span>
        )}
      </div>

      <p className="mt-4 text-sm font-medium text-brand">
        {lawyer.minPriceMnt != null
          ? copy.fromPrice.replace("{price}", lawyer.minPriceMnt.toLocaleString())
          : copy.viewOfferings}
      </p>

      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        <Link
          href={profileHref}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}
        >
          {copy.viewProfile}
        </Link>
        <Link
          href={`${profileHref}#consult`}
          className={cn(buttonVariants({ size: "sm" }), "flex-1")}
        >
          {copy.getConsultation}
        </Link>
      </div>
    </article>
  );
}
