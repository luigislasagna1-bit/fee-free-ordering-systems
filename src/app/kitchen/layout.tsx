import type { Metadata, Viewport } from "next";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import { resolveStaffLocale, loadMessages } from "@/lib/i18n-server";
import prisma from "@/lib/db";
import { KitchenSessionProvider } from "./KitchenSessionProvider";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { isNeutralResellerHost } from "@/lib/restaurant-url";

// PWA metadata: this layout's manifest scopes the installable app to /kitchen,
// so installing it from the browser pins an icon that always opens straight
// into the kitchen display (not the marketing site or customer order page).
//
// generateMetadata (not a static export) so we can de-brand the tab title on the
// shared NEUTRAL reseller host: there the surface must carry ZERO "Fee Free
// Ordering" branding, so the title drops the "Kitchen Order App" platform name in
// favor of a plain "Kitchen". The manifest + appleWebApp stay constant. Next.js 16
// reads the request host via next/headers. Luigi 2026-06-23.
export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  return {
    title: isNeutralResellerHost(host) ? "Kitchen" : "Kitchen Order App",
    manifest: "/manifest-kitchen.webmanifest",
    appleWebApp: {
      capable: true,
      title: "Kitchen",
      statusBarStyle: "black-translucent",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(kitchenAuthOptions);
  // Kitchen display starts in the restaurant's chosen language (Luigi
  // 2026-06-11); a staff member's own explicit pick still wins. See
  // resolveStaffLocale. Null restaurantId → old cookie → browser → en behavior.
  const kitchenRestaurantId = (session?.user as { restaurantId?: string } | undefined)?.restaurantId;
  const restaurantDefault = kitchenRestaurantId
    ? (await prisma.restaurant.findUnique({ where: { id: kitchenRestaurantId }, select: { defaultLanguage: true } }))?.defaultLanguage ?? null
    : null;
  const locale = await resolveStaffLocale(restaurantDefault);
  const messages = await loadMessages(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ServiceWorkerRegister />
      <KitchenSessionProvider>{children}</KitchenSessionProvider>
    </NextIntlClientProvider>
  );
}
