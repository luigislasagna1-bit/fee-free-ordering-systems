import type { Metadata, Viewport } from "next";
import { getServerSession } from "next-auth";
import { NextIntlClientProvider } from "next-intl";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import { KitchenSessionProvider } from "./KitchenSessionProvider";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

// PWA metadata: this layout's manifest scopes the installable app to /kitchen,
// so installing it from the browser pins an icon that always opens straight
// into the kitchen display (not the marketing site or customer order page).
export const metadata: Metadata = {
  title: "Kitchen Display",
  manifest: "/manifest-kitchen.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Kitchen",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  const locale = await resolveLocale({ restaurantId });
  const messages = await loadMessages(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ServiceWorkerRegister />
      <KitchenSessionProvider>{children}</KitchenSessionProvider>
    </NextIntlClientProvider>
  );
}
