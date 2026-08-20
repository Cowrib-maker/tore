import { PageSkeleton } from "@/components/layout/page-skeleton";

/** Sync loading UI — avoid awaiting dictionary on every soft navigation. */
export default function Loading() {
  return <PageSkeleton cards={1} />;
}
