import { headers } from "next/headers";
import { resolveLocale } from "@/lib/i18n-server";
import { isNeutralResellerHost } from "@/lib/restaurant-url";
import { APP_LINKS } from "@/lib/app-links";
import { KitchenLoginForm } from "./KitchenLoginForm";

// Kitchen layout already wraps children with NextIntlClientProvider, so
// we only need to resolve the locale value to thread into the language
// switcher control.
export default async function KitchenLoginPage() {
  const locale = await resolveLocale();
  // "Get the app" hint (Play launch 2026-07-22): platform-branded store
  // listing, so it must NOT show on the neutral reseller host (zero platform
  // branding there — same rule as the tab title above in layout.tsx). The
  // form additionally hides it when running INSIDE the native shell.
  const host = (await headers()).get("host");
  const getAppUrl = isNeutralResellerHost(host) ? null : APP_LINKS.kitchen.play;
  return <KitchenLoginForm locale={locale} getAppUrl={getAppUrl} />;
}
