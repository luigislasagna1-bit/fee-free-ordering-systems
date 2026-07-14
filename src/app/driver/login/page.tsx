import { resolveLocale } from "@/lib/i18n-server";
import { DriverLoginForm } from "./DriverLoginForm";

export default async function DriverLoginPage() {
  const locale = await resolveLocale();
  return <DriverLoginForm locale={locale} />;
}
