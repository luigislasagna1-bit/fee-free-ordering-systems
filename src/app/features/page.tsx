import { resolveLocale } from "@/lib/i18n-server";
import { FeaturesClient } from "./FeaturesClient";

export default async function FeaturesPage() {
  const locale = await resolveLocale();
  return <FeaturesClient locale={locale} />;
}
