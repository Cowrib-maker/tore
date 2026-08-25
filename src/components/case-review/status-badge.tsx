import { cn } from "@/lib/utils";
import { engineStatusLabelMn } from "@/application/use-cases/case-review/labels";
import {
  ConclusionDisposition,
  MappingMethod,
  ReasoningSupportStatus,
  SubsumptionMatchStatus,
} from "@/engine/doctrine";

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value === ConclusionDisposition.SUPPORTED ||
    value === SubsumptionMatchStatus.SATISFIED ||
    value === ReasoningSupportStatus.SOURCE_BACKED ||
    value === MappingMethod.EXPLICIT
      ? "border-transparent bg-brand text-brand-foreground"
      : value === ConclusionDisposition.UNSUPPORTED ||
          value === SubsumptionMatchStatus.NOT_SATISFIED ||
          value === ReasoningSupportStatus.UNSUPPORTED
        ? "border-transparent bg-destructive/10 text-destructive"
        : value === MappingMethod.MANUAL
          ? "border-transparent bg-brand text-brand-foreground"
          : "border-brand/10 bg-brand-subtle text-ink";
  return (
    <span
      data-slot="badge"
      data-status={value}
      className={cn(
        "inline-flex h-5 w-fit items-center rounded-md border px-2 font-mono text-[10px] font-medium",
        tone,
      )}
    >
      {engineStatusLabelMn(value)}
    </span>
  );
}

export function highlightedClass(active: boolean): string {
  return cn(
    "rounded-md transition-colors",
    active && "bg-brand-subtle ring-1 ring-brand/40",
  );
}
