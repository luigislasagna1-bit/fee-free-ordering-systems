import { getServerSession } from "next-auth";
import { NextIntlClientProvider } from "next-intl";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import { KitchenSessionProvider } from "./KitchenSessionProvider";

export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  const locale = await resolveLocale({ restaurantId });
  const messages = await loadMessages(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <KitchenSessionProvider>{children}</KitchenSessionProvider>
    </NextIntlClientProvider>
  );
}
