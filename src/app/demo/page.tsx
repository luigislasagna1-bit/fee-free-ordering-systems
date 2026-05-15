import { resolveLocale } from "@/lib/i18n-server";
import { DemoClient } from "./DemoClient";

export default async function DemoPage() {
  const locale = await resolveLocale();
  return <DemoClient locale={locale} />;
}
