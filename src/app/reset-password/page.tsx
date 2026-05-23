import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { Loader2 } from "lucide-react";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  const locale = await resolveLocale();
  const messages = await loadMessages(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      }>
        <ResetPasswordForm locale={locale} />
      </Suspense>
    </NextIntlClientProvider>
  );
}
