import { resolveLocale } from "@/lib/i18n-server";
import { KitchenLoginForm } from "./KitchenLoginForm";

// Kitchen layout already wraps children with NextIntlClientProvider, so
// we only need to resolve the locale value to thread into the language
// switcher control.
export default async function KitchenLoginPage() {
  const locale = await resolveLocale();
  return <KitchenLoginForm locale={locale} />;
}
