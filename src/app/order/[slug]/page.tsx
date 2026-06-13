import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import prisma from "@/lib/db";
import { OrderingPageClient } from "./OrderingPageClient";
import { resolveEffectiveMapsKey } from "@/lib/platform-maps";

/**
 * Per-restaurant browser-tab branding: the <title> is the restaurant's name
 * and the favicon is their uploaded icon (when set), instead of the generic
 * platform default. Lightweight standalone query — metadata runs separately
 * from the page render. Luigi 2026-06-04.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const r = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    select: { name: true, faviconUrl: true },
  });
  if (!r) return {};
  return {
    title: r.name,
    ...(r.faviconUrl ? { icons: { icon: r.faviconUrl } } : {}),
  };
}
import { VisitTracker } from "@/components/order/VisitTracker";
import { isSupportedLocale, type Locale } from "@/i18n/request";
import { hasFeature } from "@/lib/entitlements";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { resolveScheduledMenuId } from "@/lib/menu-schedule";
import { holidayEffectToday } from "@/lib/holiday-rules";
import { isOnMarketplace } from "@/lib/marketplace";
import { getCurrentCustomer } from "@/lib/customer-session";
import { getSessionUser } from "@/lib/session";

export default async function OrderingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embedded?: string; from?: string; testing?: string }>;
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
  //
  // We ALSO treat any request landing on a branded host (custom domain
  // OR subdomain — i.e. anything that's not the canonical platform
  // domain) as "from hosted site" by default. Without this, a customer
  // who pastes the order URL on luigispizzapastawings.com or bookmarks
  // it directly never sees the back-link even though there IS a
  // marketing site sitting at `/` of the same host (Luigi audit
  // 2026-05-30). The query-string path stays as an explicit override
  // for analytics / referrer cases.
  const hdrs = await headers();
  const host = (hdrs.get("host") || "").toLowerCase();
  const platformDomain = (process.env.PLATFORM_DOMAIN || "feefreeordering.com").toLowerCase();
  const marketplaceDomain = (process.env.MARKETPLACE_DOMAIN || "feefreefood.com").toLowerCase();
  const appSubdomain = `app.${platformDomain}`;
  const isBrandedHost =
    !!host &&
    host !== platformDomain &&
    host !== `www.${platformDomain}` &&
    host !== marketplaceDomain &&
    host !== `www.${marketplaceDomain}` &&
    host !== appSubdomain &&
    !host.startsWith("localhost") &&
    !host.startsWith("127.0.0.1");
  const fromHostedSite = sp.from === "hosted" || isBrandedHost;
  // Compute the back-link URL. On a branded host (luigispizzapastawings.com,
  // luigis.feefreeordering.com), the proxy rewrites `/` to `/site/${slug}`
  // so the cleanest link is just `/`. On the platform domain the
  // customer needs the explicit `/site/${slug}` path because `/` would
  // take them to the marketing root instead.
  const hostedSiteBackUrl = isBrandedHost ? "/" : `/site/${slug}`;

  // 1) Load the restaurant the customer is ordering FROM (the location).
  // Hours, delivery zones, fees etc. are always per-location — never inherited.
  const restaurantBase = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    include: {
      openingHours: { orderBy: { dayOfWeek: "asc" } },
      // One-off holiday closures — drive the "closed today (holiday)" banner +
      // schedule-for-later flow on the customer page. Luigi 2026-06-04.
      holidays: true,
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

  // Active promotions to display as banners at the top of the page.
  // Per Fabrizio's 2026-05-28 feedback: customers must see active promos
  // immediately (GloriaFood-style) — not only at checkout. We filter
  // server-side for visibility:
  //   - isActive + showOnBanner
  //   - startsAt..endsAt window covers "now"
  //   - daysOfWeek includes today (if specified)
  //
  // We deliberately do NOT filter by `usableHourStart/End` here — those
  // control when the promo APPLIES to a cart, not when it's visible.
  // A lunch promo (usable 12–15) still needs to appear all day so
  // customers can pre-order for tomorrow's lunch. The hour gate runs
  // at order calculation time in /api/orders.
  //
  // Brand-scoped promos: same logic as brand menus. Children that
  // inherit the brand menu also surface brand-scope promotions from
  // the parent so a "20% off all Luigi's locations" banner shows
  // everywhere.
  const now = new Date();
  const todayDow = now.getUTCDay(); // 0=Sun..6=Sat
  const candidateRestaurantIds: string[] = [restaurantBase.id];
  // If this is a child inheriting brand menu, also include the parent's
  // promotions scoped as "brand".
  if (menuRestaurantId !== restaurantBase.id) candidateRestaurantIds.push(menuRestaurantId);

  // Acquisition channel for promo gating (Luigi 2026-06-09): a customer who
  // arrived via the marketplace (and the restaurant is genuinely LISTED) only
  // sees promos channelled to "marketplace" or "both"; a direct website visitor
  // sees "website" or "both". Mirrors the authoritative viaMarketplace check the
  // order route does — and only calls isOnMarketplace on the (rare) marketplace
  // path, so normal website loads pay nothing.
  const customerChannel: "website" | "marketplace" =
    fromMarketplace && (await isOnMarketplace(restaurantBase.id)) ? "marketplace" : "website";
  const channelFilter = customerChannel === "marketplace" ? ["marketplace", "both"] : ["website", "both"];

  const rawPromotions = await prisma.promotion.findMany({
    where: {
      isActive: true,
      showOnBanner: true,
      channel: { in: channelFilter },
      OR: [
        { restaurantId: restaurantBase.id },
        { restaurantId: menuRestaurantId, scope: "brand" },
      ],
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    select: {
      id: true,
      name: true,
      description: true,
      promotionType: true,
      bannerHeadline: true,
      daysOfWeek: true,
      usableHourStart: true,
      usableHourEnd: true,
      minimumOrder: true,
      // Drives the customer-facing "Add €X more to unlock!" nudge when the
      // cart is within highlightThreshold of an auto-promo's minimum.
      highlightThreshold: true,
      orderType: true,
      couponCode: true,
      // ruleConfig + rules feed the customer-facing PromoDetailModal so
      // it can render type-specific panels (eligible items, bundle slots,
      // freebie pool). ruleConfig is the new Phase 2a JSON column; rules
      // is the legacy string fallback the engine also reads.
      ruleConfig: true,
      rules: true,
      // Owner-uploaded promo image (Phase 2a). Renders as the banner
      // card background with a dark gradient overlay for legibility.
      imageUrl: true,
      // GloriaFood-style summary panel (Luigi 2026-05-29) — drives the
      // "What you get / Conditions" lists in the customer modal. All
      // optional on the modal side; pass through whatever's set.
      autoApply: true,
      customerType: true,
      startsAt: true,
      endsAt: true,
      paymentMethodSlugs: true,
      deliveryZoneIds: true,
      onceLifetimePerClient: true,
      // Campaign ownership — lets the ordering page lift the Kickstarter
      // first-buy promo out of the regular strip into a prominent hero.
      campaignRef: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10, // hard cap — UI is a horizontal scroller anyway
  });

  // Day-of-week filter happens in app code (DB stores as JSON string
  // for backwards compat). NULL/empty daysOfWeek = all days.
  const promoBanners = rawPromotions.filter((p) => {
    if (!p.daysOfWeek) return true;
    try {
      const days = JSON.parse(p.daysOfWeek);
      if (!Array.isArray(days) || days.length === 0) return true;
      return days.includes(todayDow);
    } catch {
      return true; // malformed → show defensively rather than hide
    }
  });

  // Multi-menu: serve the menu that is live for the customer RIGHT NOW. With no
  // daily windows configured this is just the single active menu (unchanged);
  // with windows it auto-switches by time of day (Lunch/Dinner), restaurant tz.
  // Falls back to a restaurant-wide query if (somehow) there's no menu, so the
  // ordering page never goes blank. Luigi 2026-06-05 / 2026-06-12.
  const activeMenuId = await resolveScheduledMenuId(menuRestaurantId);
  const menuCategories = await prisma.menuCategory.findMany({
    where: activeMenuId
      ? { menuId: activeMenuId, isActive: true }
      : { restaurantId: menuRestaurantId, isActive: true },
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
  // Owner "Preview & test ordering" (reseller report cmq3red6b): ?testing=1
  // only takes effect for a logged-in admin of THIS restaurant (or a
  // superadmin) — for customers the param is inert. The flag flows to the
  // client (banner + isTest on the order POST); the order route re-verifies
  // the session before honouring isTest, so this is display-level only.
  let isTestPreview = false;
  if (sp.testing === "1") {
    const adminUser = await getSessionUser().catch(() => null);
    isTestPreview =
      !!adminUser && (adminUser.restaurantId === restaurantBase.id || adminUser.role === "superadmin");
  }

  const restaurant = { ...restaurantBase, menuCategories } as typeof restaurantBase & {
    menuCategories: typeof menuCategories;
  };
  // Platform Google Maps fallback (Luigi 2026-06-13): a restaurant with no key
  // of its own uses the platform key (PlatformSettings.googleMapsApiKey), so
  // Google maps + Places autocomplete work on EVERY ordering page with zero
  // per-restaurant setup. The restaurant's own key still wins.
  restaurant.googleMapsApiKey = await resolveEffectiveMapsKey(restaurant.googleMapsApiKey);

  // Card payments (KEY-ONLY model) require BOTH:
  //   1. THIS restaurant has saved active Stripe API keys (PaymentProvider)
  //      via Settings → Payments — i.e. their own publishable + secret key.
  //   2. THIS restaurant has the card_payments entitlement (via Online
  //      Payments add-on subscription in /admin/billing/add-ons).
  // The old Stripe Connect path (stripeAccountId / stripeChargesEnabled /
  // platform stripeReady) is gone — restaurants connect with their own keys.
  const [provider, hasCardPayments] = await Promise.all([
    prisma.paymentProvider.findUnique({
      where: { restaurantId: restaurant.id },
      select: { isActive: true, publishableKey: true },
    }),
    hasFeature(restaurant.id, "card_payments"),
  ]);
  const providerReady = !!(provider?.isActive && provider.publishableKey);
  const cardPaymentEnabled = providerReady && hasCardPayments;

  // PayPal mirrors the card-payments gate but uses the per-restaurant
  // PayPal connection. Shares the `card_payments` entitlement so
  // restaurants paying for Online Payments get both processors for the
  // same subscription.
  const paypalEnabled =
    (restaurant as any).paypalAccountStatus === "connected" && hasCardPayments;

  // The restaurant's OWN publishable key (key-only model). The actual
  // per-order PaymentIntent + matching publishable key come back from
  // /api/public/payment-intent at checkout time; this prop is kept for any
  // UI that needs to know a key is present.
  const stripePublishableKey = cardPaymentEnabled
    ? provider?.publishableKey ?? null
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

  // Accepted payment methods — owner sets these in /admin/payments. The config
  // can be a legacy flat list OR a per-order-type object (Luigi 2026-06-08); we
  // pass the RAW JSON to the client, which derives the accepted methods for the
  // currently-selected order type (and forces online-card for marketplace). See
  // src/lib/payment-methods.ts. Defensive: non-string → "[]".
  const paymentMethodsRaw =
    typeof (restaurant as any).paymentMethods === "string"
      ? (restaurant as any).paymentMethods
      : "[]";

  // Resolve the per-restaurant customer session (if any) so the header
  // can render "Sign in" vs "Hi, <name>" without a client-side fetch
  // flash. Imported here to keep page.tsx as the single entrypoint that
  // talks to the session lib — the client component doesn't need to
  // know about cookies.
  const { getCurrentRestaurantCustomer } = await import("@/lib/restaurant-customer-session");
  const currentCustomer = await getCurrentRestaurantCustomer({
    expectedRestaurantId: restaurant.id,
  });

  // Marketplace-wide account (CustomerAccount) — only looked up on the
  // marketplace view, where its sign-in replaces the per-restaurant one. The
  // marketplace customer base is distinct, so a marketplace visitor signs into
  // their ONE cross-restaurant account. Luigi 2026-06-09.
  const marketplaceAccountRow = fromMarketplace ? await getCurrentCustomer() : null;
  const marketplaceAccount = marketplaceAccountRow ? { name: marketplaceAccountRow.name } : null;

  // First-buy hero gating: only entice customers we CAN'T rule out as new. If a
  // customer is LOGGED IN and already has a FULFILLED order here (matched by
  // their Customer row / email / phone), they're returning — hide the first-buy
  // hero (it isn't for them anyway). Missed/rejected/cancelled orders don't
  // count (consistent with the coupon ledger), so a first-timer whose debut
  // order failed still sees it. Anonymous visitors (most genuine new customers)
  // still see it; the discount itself stays new-customers-only at checkout. The
  // client adds a same-device "ordered here before" guard for guests on top of
  // this. Luigi 2026-06-09.
  let customerIsReturning = false;
  if (currentCustomer) {
    const priorFulfilled = await prisma.order.count({
      where: {
        restaurantId: restaurant.id,
        status: { notIn: ["cancelled", "rejected"] },
        // Per-channel (H2): on a marketplace visit, only prior MARKETPLACE
        // orders count as "returning" — so a website regular still sees the
        // marketplace first-buy hero (and vice-versa). Luigi 2026-06-09.
        viaMarketplace: customerChannel === "marketplace",
        OR: [
          { customerId: currentCustomer.id },
          ...(currentCustomer.email ? [{ customerEmail: currentCustomer.email }] : []),
          ...(currentCustomer.phone ? [{ customerPhone: currentCustomer.phone }] : []),
        ],
      },
    });
    customerIsReturning = priorFulfilled > 0;
  }

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
        paymentMethodsRaw={paymentMethodsRaw}
        fromHostedSite={fromHostedSite}
        hostedSiteBackUrl={hostedSiteBackUrl}
        promoBanners={promoBanners}
        customerChannel={customerChannel}
        marketplaceAccount={marketplaceAccount}
        customerIsReturning={customerIsReturning}
        isTestPreview={isTestPreview}
        {...(() => {
          // Gloriafood-parity special days (Luigi 2026-06-11): resolve today's
          // GENERAL effect (banner + open-status override) and which specific
          // services are holiday-closed while the rest stays open.
          const holRows = (restaurant as any).holidays;
          const holTz = (restaurant as any).timezone;
          const general = holidayEffectToday(holRows, holTz, null);
          const generalClosed = general?.kind === "closed";
          const holidayClosedServices = generalClosed
            ? []
            : ["pickup", "delivery", "dine_in", "take_out", "catering", "reservation"].filter(
                (s) => holidayEffectToday(holRows, holTz, s)?.kind === "closed",
              );
          // Message: prefer the general entry's; else surface the first
          // service-specific closed entry's message so it isn't lost.
          const serviceMessage = !general && holidayClosedServices.length > 0
            ? (holidayEffectToday(holRows, holTz, holidayClosedServices[0])?.message ?? null)
            : null;
          return {
            todayHolidayName: general?.name ?? null,
            todayHolidayMessage: general?.message ?? serviceMessage,
            todayHolidayIntervals: general?.kind === "custom_hours" ? general.intervals : null,
            // Explicit flag — name and message are both OPTIONAL, so the
            // client can't infer "fully closed today" from their presence
            // (a blank-name closure rendered the wrong banner variant and
            // never reached closed-now detection — found in Luigi's live
            // test of cmpxds2d2, 2026-06-12).
            todayHolidayClosed: generalClosed,
            holidayClosedServices,
          };
        })()}
        currentCustomer={currentCustomer
          ? {
              id: currentCustomer.id,
              name: currentCustomer.name,
              email: currentCustomer.email,
              phone: currentCustomer.phone,
              // Surfaced so the checkout marketing checkbox pre-fills to the
              // customer's stored choice — an opted-out customer sees it
              // unchecked instead of being silently re-opted-in. Luigi 2026-06-03.
              marketingConsent: currentCustomer.marketingConsent,
            }
          : null}
      />
    </NextIntlClientProvider>
  );
}
