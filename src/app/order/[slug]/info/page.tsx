import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import prisma from "@/lib/db";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import { resolveEffectiveMapsKey } from "@/lib/platform-maps";
import { isOwnCustomDomainHost } from "@/lib/restaurant-url";
import { RestaurantInfoClient } from "./RestaurantInfoClient";

export default async function RestaurantInfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    select: {
      id: true,
      slug: true, name: true, slogan: true, description: true,
      // Custom-domain fields → hide the "Powered by Fee Free Ordering" footer when
      // the customer is on the restaurant's OWN verified domain (white-label). On a
      // platform subdomain / apex the branding still shows. Luigi 2026-06-22.
      customDomain: true, customDomainStatus: true,
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

  // White-label: suppress the platform "Powered by" footer when the customer is
  // served on the restaurant's own verified custom domain (zero platform branding).
  const host = (await headers()).get("host");
  const hideBranding = isOwnCustomDomainHost(restaurant, host);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <RestaurantInfoClient restaurant={restaurant as any} hideBranding={hideBranding} />
    </NextIntlClientProvider>
  );
}
