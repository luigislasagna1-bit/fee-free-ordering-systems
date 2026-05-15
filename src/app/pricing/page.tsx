import { resolveLocale } from "@/lib/i18n-server";
import { PricingClient } from "./PricingClient";

export default async function PricingPage() {
  const locale = await resolveLocale();
  return <PricingClient locale={locale} />;
}
