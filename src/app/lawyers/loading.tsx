import { BrandSplash } from "@/components/brand/brand-splash";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function Loading() {
  const dict = await getDictionary();
  return <BrandSplash label={dict.marketplace.common.loading} />;
}
