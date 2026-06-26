import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import prisma from "@/lib/db";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import { resolveEffectiveMapsKey } from "@/lib/platform-maps";
import { resolvePoweredByCredit, RESELLER_WHITE_LABEL_SELECT } from "@/lib/white-label";
import { RestaurantInfoClient } from "./RestaurantInfoClient";

export default async function RestaurantInfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    select: {
      id: true,
      slug: true, name: true, slogan: true, description: true,
      // Reseller white-label gate for the "Powered by Fee Free Ordering" credit:
      // we SHOW the credit on every restaurant (free marketing + SEO backlink) and
      // hide it for de-branded resellers (free de-brand tier — approved reseller who
      // configured an imprint or logo). Luigi 2026-06-23.
      resellerProfile: { select: RESELLER_WHITE_LABEL_SELECT },
      phone: true, email: true, address: true, city: true, state: true, zip: true,
      lat: true, lng: true,
      mapProvider: true, googleMapsApiKey: true,
      logoUrl: true, bannerUrl: true,
      acceptsPickup: true, acceptsDelivery: true, acceptsDineIn: true,
      acceptsCatering: true, acceptsTakeOut: true, acceptsReservations: true,
      estimatedPickup: true, estimatedDelivery: true,
      // hoursFormat → render the live-status banner + per-service "Opens…" badges
      // + weekday rows in the restaurant's 12h/24h format (was defaulting to 24h
      // because it wasn't loaded). timezone → correct open/closed for the tz.
      // Luigi 2026-06-22.
      hoursFormat: true, timezone: true,
      reviewLink: true, infoContent: true,
      themeSettings: true, serviceSettings: true, defaultLanguage: true,
      openingHours: { orderBy: { dayOfWeek: "asc" } },
      // Special-day closures (today + future) so the info page can surface an
      // amber "special hours / closed today" callout + the owner's custom note —
      // previously only the ordering page showed these. Luigi 2026-06-26.
      holidays: {
        where: { OR: [{ date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }, { endDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }] },
        orderBy: { date: "asc" },
        select: { date: true, endDate: true, name: true, rules: true, message: true },
      },
      deliveryZones: {
        where: { isActive: true },
        orderBy: [{ radiusKm: "asc" }, { sortOrder: "asc" }],
      },
    },
  });

  if (!restaurant) notFound();

  // The "Our delivery areas" map here is a prominent sales visual, so it uses
  // Google tiles — resolve the restaurant's own key, else the platform key
  // (Luigi 2026-06-13). The functional pin/zone maps stay free Leaflet.
  (restaurant as any).googleMapsApiKey = await resolveEffectiveMapsKey(restaurant.googleMapsApiKey);

  const locale = await resolveLocale({ restaurantId: restaurant.id });
  const messages = await loadMessages(locale);

  // SHOW the clickable "Powered by Fee Free Ordering" credit on every restaurant
  // (free marketing + SEO backlink), suppressing it ONLY for reseller white-label
  // accounts (they pay for their own branding). A plain restaurant on its own
  // verified custom domain STILL shows the credit. Luigi 2026-06-22.
  const poweredByCredit = resolvePoweredByCredit(restaurant.resellerProfile);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <RestaurantInfoClient restaurant={restaurant as any} poweredByCredit={poweredByCredit} />
    </NextIntlClientProvider>
  );
}
