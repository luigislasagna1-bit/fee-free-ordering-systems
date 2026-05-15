import { resolveLocale } from "@/lib/i18n-server";
import { FaqClient } from "./FaqClient";

export default async function FaqPage() {
  const locale = await resolveLocale();
  return <FaqClient locale={locale} />;
}
