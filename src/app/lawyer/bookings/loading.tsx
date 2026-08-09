import { PageSkeleton } from "@/components/layout/page-skeleton";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function Loading() {
  const dict = await getDictionary();
  return (
    <PageSkeleton cards={2} label={dict.marketplace.common.loading} />
  );
}
