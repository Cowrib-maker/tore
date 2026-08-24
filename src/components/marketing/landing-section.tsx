import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function LandingSection({
  id,
  children,
  className,
  muted = false,
  imageUrl,
  imageSlot,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  muted?: boolean;
  imageUrl?: string | null;
  /**
   * Admin-preview-only override: when provided, this is rendered in place
   * of the plain `<img>` (regardless of whether `imageUrl` is set), so the
   * admin editor can show a click/drag-and-drop upload control exactly
   * where the image will render on the real homepage. Never set on the
   * public homepage.
   */
  imageSlot?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 border-b border-[#0B1F3A]/8",
        muted ? "bg-[#F4F6F8]" : "bg-white",
        className,
      )}
    >
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16 lg:py-18">
        {imageSlot ? (
          <div className="mb-10">{imageSlot}</div>
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="mb-10 max-h-96 w-full rounded-2xl border border-[#0B1F3A]/10 object-cover"
          />
        ) : null}
        {children}
      </div>
    </section>
  );
}

export function LandingEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] font-semibold tracking-[0.16em] text-[#5C6570] uppercase sm:text-[13px]">
      {children}
    </p>
  );
}

export function LandingHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-2 font-[family-name:var(--font-landing-display)] text-[1.85rem] leading-[1.12] tracking-[-0.03em] text-[#0A0F14] sm:text-[2.25rem]">
      {children}
    </h2>
  );
}

export function LandingLead({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mt-4 max-w-2xl text-[15px] leading-relaxed text-[#5C6570] sm:text-base",
        className,
      )}
    >
      {children}
    </p>
  );
}
