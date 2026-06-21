import type { Metadata } from "next";
import { resolveLocale } from "@/lib/i18n-server";
import { ImportClient } from "./ImportClient";

export const metadata: Metadata = {
  title: "Import your GloriaFood menu — try it live | Fee Free Ordering",
  description:
    "Paste your GloriaFood menu and see your own restaurant live in a 0%-commission ordering page in seconds — photos, sizes and toppings included. No account needed.",
};

export default async function ImportPage() {
  const locale = await resolveLocale();
  return <ImportClient locale={locale} />;
}
