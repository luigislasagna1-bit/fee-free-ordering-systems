import { resolveLocale } from "@/lib/i18n-server";
import { HomeClient } from "./HomeClient";

export default async function HomePage() {
  const locale = await resolveLocale();
  return <HomeClient locale={locale} />;
}
