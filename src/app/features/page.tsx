import { resolveLocale } from "@/lib/i18n-server";
import { marketingMetadata } from "@/lib/seo";
import { FeaturesClient } from "./FeaturesClient";

export const metadata = marketingMetadata({
  title: "Features — Fee Free Ordering",
  description: "Branded ordering for pickup, delivery, dine-in & catering, a kitchen order app with WiFi thermal printing, reservations, marketing tools, and a 0% commission marketplace.",
  path: "/features",
});

export default async function FeaturesPage() {
  const locale = await resolveLocale();
  return <FeaturesClient locale={locale} />;
}
