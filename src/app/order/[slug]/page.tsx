import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import prisma from "@/lib/db";
import { OrderingPageClient } from "./OrderingPageClient";
import { VisitTracker } from "@/components/order/VisitTracker";
import { isSupportedLocale, type Locale } from "@/i18n/request";
import { stripeReady, getPublishableKey } from "@/lib/stripe";
import { hasFeature } from "@/lib/entitlements";
import { resolveMenuRestaurantId } from "@/lib/brand";

export default async function OrderingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embedded?: string; from?: string }>;
}) {
  const { slug } = await params;
  // `?embedded=1` — set by the iframe widget script. Strips banner photo,
  // contact bar buttons, info link, and social footer so the widget is
  // a minimal "menu + order" surface, not a full marketing page. The full
  // restaurant SEO website (banner / about / contact / footer) lives at
  // /site/<slug> and is gated behind the hosted_website add-on.
  const sp = await searchParams;
  const isEmbedded = sp.embedded === "1";
  // ?from=marketplace marks the customer as arriving via our public
  // marketplace browse page. Marketplace orders MUST be paid online
  // (no cash, no pay-in-person) — restaurants opted into the marketplace
  // contractually accept card-only orders. This flag is what flips the
  // checkout payment picker to "online card only" mode below.
  const fromMarketplace = sp.from === "marketplace";
  // ?from=hosted marks the customer as arriving from this restaurant's
  // Sales Optimized Website (subdomain marketing page). Used to render
  // a "Back to <Restaurant>'s site" breadcrumb so the customer isn't
  // stuck on /order with no way back to the page they were just on.
  const fromHostedSite = sp.from === "hosted";

  // 1) Load the restaurant the customer is ordering FROM (the location).
  // Hours, delivery zones, fees etc. are always per-location — never inherited.
  const restaurantBase = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    include: {
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

  if (!restaurantBase) notFound();

  // 2) Resolve which restaurant's MENU to serve. For a standalone restaurant
  // or a customized child, this is the restaurant's own id. For a child
  // inheriting the brand menu, this is the parent's id — so the customer
  // sees the brand's menu but everything else (hours, delivery, taxes, the
  // Connect account that money flows to) stays local to the location they're
  // ordering from.
  const menuRestaurantId = await resolveMenuRestaurantId(restaurantBase.id);

  const menuCategories = await prisma.menuCategory.findMany({
    where: { restaurantId: menuRestaurantId, isActive: true },
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
  });

  // Splice the menu onto the restaurant object so the existing client
  // component reads `restaurant.menuCategories` unchanged. The location's
  // own row carries everything; only `menuCategories` is potentially from
  // the parent.
  const restaurant = { ...restaurantBase, menuCategories } as typeof restaurantBase & {
    menuCategories: typeof menuCategories;
  };

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

  // PayPal mirrors the card-payments gate but uses the per-restaurant
  // PayPal connection instead of platform Stripe + restaurant Connect.
  // Shares the `card_payments` entitlement so restaurants paying for
  // Online Payments get both processors for the same subscription.
  const paypalEnabled =
    (restaurant as any).paypalAccountStatus === "connected" && hasCardPayments;

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

  // Accepted payment methods — owner sets these in /admin/payments.
  // The customer checkout picker reflects only what the restaurant
  // actually accepts. Defensive parse: legacy / malformed JSON falls
  // back to ["cash"] so checkout never breaks.
  let acceptedMethods: string[] = ["cash"];
  const raw = (restaurant as any).paymentMethods;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        acceptedMethods = parsed.filter((m: unknown): m is string => typeof m === "string");
      }
    } catch { /* keep default */ }
  }

  // Marketplace orders OVERRIDE the restaurant's accepted methods —
  // they're online-card-only by platform rule. Restaurants who join
  // the marketplace are required to have card_payments + Stripe Connect
  // (enforced at marketplace signup via getMarketplaceEligibility), so
  // this override is always satisfiable. If somehow the restaurant
  // lost their card_payments entitlement after signing up, the customer
  // will see "card only" in the picker but `cardPaymentEnabled` will
  // be false → place-order shows the "coming soon" message instead of
  // accepting the order. Worst case is graceful failure, never silent
  // cash acceptance for a marketplace order.
  if (fromMarketplace) {
    acceptedMethods = ["online_card"];
  }

  // Resolve the per-restaurant customer session (if any) so the header
  // can render "Sign in" vs "Hi, <name>" without a client-side fetch
  // flash. Imported here to keep page.tsx as the single entrypoint that
  // talks to the session lib — the client component doesn't need to
  // know about cookies.
  const { getCurrentRestaurantCustomer } = await import("@/lib/restaurant-customer-session");
  const currentCustomer = await getCurrentRestaurantCustomer({
    expectedRestaurantId: restaurant.id,
  });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {/* Analytics beacon — fires /api/track/visit once on mount so
          Website Visits + Website Funnel reports have data to render.
          Renders null; safe to mount alongside the order client. */}
      <VisitTracker restaurantId={restaurant.id} />
      <OrderingPageClient
        restaurant={restaurant as any}
        cardPaymentEnabled={cardPaymentEnabled}
        paypalEnabled={paypalEnabled}
        stripePublishableKey={stripePublishableKey}
        themeSettings={(restaurant as any).themeSettings ?? null}
        locale={locale}
        isEmbedded={isEmbedded}
        acceptedMethods={acceptedMethods}
        fromHostedSite={fromHostedSite}
        currentCustomer={currentCustomer
          ? {
              id: currentCustomer.id,
              name: currentCustomer.name,
              email: currentCustomer.email,
              phone: currentCustomer.phone,
            }
          : null}
      />
    </NextIntlClientProvider>
  );
}
