"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { ToreLogo, type ToreLogoProps } from "@/components/brand/tore-logo";
import { BRAND_LOGO_SHELL, BRAND_NAME } from "@/components/brand/tokens";
import { cn } from "@/lib/utils";

type BrandLinkProps = {
  brand?: string;
  className?: string;
  /** Override logo appearance; ignored when custom children are passed. */
  logo?: Omit<ToreLogoProps, "brand">;
  children?: ReactNode;
};

/**
 * App-wide brand control — always navigates home.
 * On `/` with a hash (#how, #trust, …), clears the hash and scrolls to top
 * (Next.js Link alone is a no-op when the pathname is already `/`).
 */
export function BrandLink({
  brand = BRAND_NAME,
  className,
  logo = BRAND_LOGO_SHELL,
  children,
}: BrandLinkProps) {
  const pathname = usePathname();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (pathname !== "/") {
      return;
    }

    event.preventDefault();

    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, "", "/");
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  return (
    <Link
      href="/"
      aria-label={`${brand} home`}
      onClick={handleClick}
      className={cn("inline-flex cursor-pointer items-center", className)}
    >
      {children ?? (
        <ToreLogo brand={brand} variant="full" tone="on-light" {...logo} />
      )}
    </Link>
  );
}
