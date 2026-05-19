import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import prisma from "@/lib/db";
import { OrderingPageClient } from "./OrderingPageClient";
import { isSupportedLocale, type Locale } from "@/i18n/request";
import { stripeReady, getPublishableKey } from "@/lib/stripe";
import { hasFeature } from "@/lib/entitlements";

export default async function OrderingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    include: {
      menuCategories: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          // Category-level modifier groups (inherited by all items in the category)
          modifierGroups: {
            where: { menuItemId: null, isHidden: false },
            orderBy: { sortOrder: "asc" },
            include: {
              options: {
                where: { isAvailable: true },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
          menuItems: {
            where: { isAvailable: true },
            orderBy: { sortOrder: "asc" },
            include: {
              variants: { orderBy: { sortOrder: "asc" } },
              modifierGroups: {
                where: { isHidden: false },
                orderBy: { sortOrder: "asc" },
                include: {
                  options: {
                    where: { isAvailable: true },
                    orderBy: { sortOrder: "asc" },
                  },
                },
              },
            },
          },
        },
      },
      openingHours: { orderBy: { dayOfWeek: "asc" } },
      deliveryZones: {
        where: { isActive: true },
        orderBy: [{ radiusKm: "asc" }, { sortOrder: "asc" }],
      },
      reservationSettings: true,
      serviceFees: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!restaurant) notFound();

  // Card payments require THREE things to all be true:
  //   1. The platform has Stripe configured (PlatformSettings, see stripeReady())
  //   2. THIS restaurant has Stripe Connect onboarded with charges enabled
  //   3. THIS restaurant has the card_payments entitlement (via Online Payments
  //      add-on subscription in /admin/billing/add-ons)
  // The legacy PaymentProvider table is intentionally ignored — it predates
  // the entitlement model and we don't populate it for new restaurants.
  const [platformReady, hasCardPayments] = await Promise.all([
    stripeReady(),
    hasFeature(restaurant.id, "card_payments"),
  ]);
  const connectReady = !!(
    (restaurant as any).stripeAccountId && (restaurant as any).stripeChargesEnabled
  );
  const cardPaymentEnabled = platformReady && connectReady && hasCardPayments;

  // Pull the PLATFORM publishable key — destination-charge model means the
  // platform's key (not the restaurant's) is what the Stripe Elements
  // confirms the PaymentIntent with.
  const stripePublishableKey = cardPaymentEnabled
    ? await getPublishableKey().catch(() => null)
    : null;

  // Resolve effective locale: cookie override → restaurant default → "en".
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("fee-free-locale")?.value;
  const restaurantLocale = (restaurant as any).defaultLanguage;
  const locale: Locale = isSupportedLocale(cookieLocale)
    ? cookieLocale
    : isSupportedLocale(restaurantLocale)
      ? restaurantLocale
      : "en";

  const messages = (await import(`@/messages/${locale}.json`)).default;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <OrderingPageClient
        restaurant={restaurant as any}
        cardPaymentEnabled={cardPaymentEnabled}
        stripePublishableKey={stripePublishableKey}
        themeSettings={(restaurant as any).themeSettings ?? null}
        locale={locale}
      />
    </NextIntlClientProvider>
  );
}
