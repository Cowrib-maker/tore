import { ToreLogo } from "@/components/brand/tore-logo";
import { BrandTagline } from "@/components/brand/brand-tagline";
import { BRAND_NAME } from "@/components/brand/tokens";
import { cn } from "@/lib/utils";

export type BrandSplashProps = {
  className?: string;
  label?: string;
};

/**
 * Loading / splash brand moment:
 *   TORE
 *   LEGAL. AI. CONNECTED.
 */
export function BrandSplash({ className, label }: BrandSplashProps) {
  return (
    <div
      className={cn(
        "flex min-h-svh flex-col items-center justify-center bg-[#FAF9F7]",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label ?? BRAND_NAME}
    >
      <div className="flex flex-col items-center">
        <ToreLogo
          brand={BRAND_NAME}
          showTagline={false}
          markClassName="size-10"
          wordmarkClassName="text-xl tracking-[-0.02em]"
          className="gap-3.5"
        />
        <BrandTagline />
      </div>
    </div>
  );
}
