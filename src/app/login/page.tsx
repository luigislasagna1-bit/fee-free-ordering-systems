import { NextIntlClientProvider } from "next-intl";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const locale = await resolveLocale();
  const messages = await loadMessages(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LoginForm locale={locale} />
    </NextIntlClientProvider>
  );
}
