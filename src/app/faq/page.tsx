import { resolveLocale } from "@/lib/i18n-server";
import { marketingMetadata } from "@/lib/seo";
import { FaqClient } from "./FaqClient";

export const metadata = marketingMetadata({
  title: "FAQ — Fee Free Ordering",
  description: "Answers about 0% commission online ordering: setup, importing your menu, the kitchen app, payments, marketing tools, pricing, data ownership, and 24/7 support.",
  path: "/faq",
});

export default async function FaqPage() {
  const locale = await resolveLocale();
  return <FaqClient locale={locale} />;
}
