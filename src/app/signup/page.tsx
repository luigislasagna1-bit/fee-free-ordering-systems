import { resolveLocale } from "@/lib/i18n-server";
import { SignupForm } from "./SignupForm";

export default async function SignupPage() {
  const locale = await resolveLocale();
  return <SignupForm locale={locale} />;
}
