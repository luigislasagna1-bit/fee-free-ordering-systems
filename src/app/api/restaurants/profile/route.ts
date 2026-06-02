import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

/**
 * GET — small endpoint used by surfaces that need a single Restaurant
 * field without loading the entire profile. Notably the new Sales Tax
 * card on /admin/service-fees fetches just `taxRate` from here so we
 * don't have to mirror state through layout props.
 */
export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      taxRate: true,
      deliveryFee: true,
      minimumOrder: true,
      tipsEnabled: true,
      currency: true,
      scheduledOrderInterval: true,
      requireCustomerEmail: true,
      requireCustomerPhone: true,
      showCustomerMenuSearch: true,
      // Surface the owner-uploaded custom alarm sound URL so the KDS
      // can offer it as a third option in its Sound Settings picker.
      kitchenAlertSoundUrl: true,
    },
  });
  return NextResponse.json(restaurant ?? {});
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const {
    name, slogan, description, phone, email, address, city, state, zip, country, cuisineType,
    timezone, taxRate, tipsEnabled, currency, minimumOrder, deliveryFee, estimatedPickup, estimatedDelivery,
    acceptsPickup, acceptsDelivery, acceptsDineIn, acceptsCatering, acceptsReservations,
    logoUrl, bannerUrl, reviewLink, infoContent, themeSettings,
    lat, lng,
    mapProvider, googleMapsApiKey,
    defaultLanguage,
    kitchenWorkflowMode,
    printNodeEnabled,
    scheduledOrderInterval,
    requireCustomerEmail,
    requireCustomerPhone,
    showCustomerMenuSearch,
  } = data;

  const ALLOWED_LOCALES = ["en", "fr", "es", "it", "pt"];

  if (mapProvider !== undefined && mapProvider !== "leaflet" && mapProvider !== "google") {
    return NextResponse.json({ error: "Invalid mapProvider" }, { status: 400 });
  }

  // Build update object — only include fields that were sent
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (slogan !== undefined) updateData.slogan = slogan;
  if (description !== undefined) updateData.description = description;
  if (phone !== undefined) updateData.phone = phone;
  if (email !== undefined) updateData.email = email;
  if (address !== undefined) updateData.address = address;
  if (city !== undefined) updateData.city = city;
  if (state !== undefined) updateData.state = state;
  if (zip !== undefined) updateData.zip = zip;
  if (country !== undefined && typeof country === "string" && country.trim()) {
    updateData.country = country.trim().slice(0, 10);
  }
  if (cuisineType !== undefined) updateData.cuisineType = cuisineType;
  if (timezone !== undefined) updateData.timezone = timezone;
  // ── Numeric field validation (audit 2026-05-30) ─────────────────────
  // Previously these were stamped raw — a negative taxRate or a 0-minute
  // estimatedPickup would persist and quietly break the customer flow.
  // Reject loudly with a 400 so the client surfaces the error instead
  // of letting Prisma write garbage.
  if (taxRate !== undefined) {
    const n = typeof taxRate === "number" ? taxRate : parseFloat(taxRate);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return NextResponse.json(
        { error: "taxRate must be a number between 0 and 100" },
        { status: 400 },
      );
    }
    updateData.taxRate = n;
  }
  if (tipsEnabled !== undefined) updateData.tipsEnabled = !!tipsEnabled;
  if (showCustomerMenuSearch !== undefined) updateData.showCustomerMenuSearch = !!showCustomerMenuSearch;
  if (currency !== undefined && typeof currency === "string") {
    // ISO 4217 sanity — 3 letters. Normalize to lowercase (matches
    // Stripe's expected format and our DB default). Anything else is
    // rejected so a typo doesn't break Stripe charges silently.
    const c = currency.trim().toLowerCase();
    if (!/^[a-z]{3}$/.test(c)) {
      return NextResponse.json(
        { error: "currency must be a 3-letter ISO 4217 code (e.g. usd, eur, gbp)" },
        { status: 400 },
      );
    }
    updateData.currency = c;
  }
  if (minimumOrder !== undefined) {
    const n = typeof minimumOrder === "number" ? minimumOrder : parseFloat(minimumOrder);
    if (!Number.isFinite(n) || n < 0 || n > 10000) {
      return NextResponse.json(
        { error: "minimumOrder must be a non-negative dollar amount under $10,000" },
        { status: 400 },
      );
    }
    updateData.minimumOrder = n;
  }
  if (deliveryFee !== undefined) {
    const n = typeof deliveryFee === "number" ? deliveryFee : parseFloat(deliveryFee);
    if (!Number.isFinite(n) || n < 0 || n > 500) {
      return NextResponse.json(
        { error: "deliveryFee must be a non-negative dollar amount under $500" },
        { status: 400 },
      );
    }
    updateData.deliveryFee = n;
  }
  if (estimatedPickup !== undefined) {
    const n = typeof estimatedPickup === "number" ? estimatedPickup : parseInt(estimatedPickup, 10);
    if (!Number.isFinite(n) || n < 1 || n > 240) {
      return NextResponse.json(
        { error: "estimatedPickup must be between 1 and 240 minutes" },
        { status: 400 },
      );
    }
    updateData.estimatedPickup = n;
  }
  if (estimatedDelivery !== undefined) {
    const n = typeof estimatedDelivery === "number" ? estimatedDelivery : parseInt(estimatedDelivery, 10);
    if (!Number.isFinite(n) || n < 1 || n > 240) {
      return NextResponse.json(
        { error: "estimatedDelivery must be between 1 and 240 minutes" },
        { status: 400 },
      );
    }
    updateData.estimatedDelivery = n;
  }
  if (acceptsPickup !== undefined) updateData.acceptsPickup = acceptsPickup;
  if (acceptsDelivery !== undefined) updateData.acceptsDelivery = acceptsDelivery;
  if (acceptsDineIn !== undefined) updateData.acceptsDineIn = acceptsDineIn;
  if (acceptsCatering !== undefined) updateData.acceptsCatering = acceptsCatering;
  if (acceptsReservations !== undefined) updateData.acceptsReservations = acceptsReservations;
  if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
  if (bannerUrl !== undefined) updateData.bannerUrl = bannerUrl;
  if (reviewLink !== undefined) updateData.reviewLink = reviewLink;
  if (infoContent !== undefined) updateData.infoContent = infoContent;
  if (themeSettings !== undefined) updateData.themeSettings = themeSettings;
  if (lat !== undefined) updateData.lat = lat;
  if (lng !== undefined) updateData.lng = lng;
  if (mapProvider !== undefined) updateData.mapProvider = mapProvider;
  if (googleMapsApiKey !== undefined) updateData.googleMapsApiKey = googleMapsApiKey || null;
  if (defaultLanguage !== undefined && ALLOWED_LOCALES.includes(defaultLanguage)) {
    updateData.defaultLanguage = defaultLanguage;
  }
  if (kitchenWorkflowMode !== undefined) {
    // Validate against the two valid values — anything else is a
    // client bug; reject loudly rather than silently storing garbage.
    if (kitchenWorkflowMode !== "simple" && kitchenWorkflowMode !== "tracking") {
      return NextResponse.json({ error: "Invalid kitchenWorkflowMode" }, { status: 400 });
    }
    updateData.kitchenWorkflowMode = kitchenWorkflowMode;
  }
  if (printNodeEnabled !== undefined) updateData.printNodeEnabled = !!printNodeEnabled;
  // Scheduled-order slot interval (Luigi 2026-05-31). Whitelist values
  // so we don't accidentally accept 1-minute (kitchen chaos) or 1440
  // (no slots in a day). 10/15/20/30/60 covers every real workflow.
  if (scheduledOrderInterval !== undefined) {
    const n = typeof scheduledOrderInterval === "number"
      ? scheduledOrderInterval
      : parseInt(scheduledOrderInterval, 10);
    if (![10, 15, 20, 30, 60].includes(n)) {
      return NextResponse.json(
        { error: "scheduledOrderInterval must be 10, 15, 20, 30, or 60" },
        { status: 400 },
      );
    }
    updateData.scheduledOrderInterval = n;
  }
  if (requireCustomerEmail !== undefined) updateData.requireCustomerEmail = !!requireCustomerEmail;
  if (requireCustomerPhone !== undefined) updateData.requireCustomerPhone = !!requireCustomerPhone;

  await prisma.restaurant.update({ where: { id: restaurantId }, data: updateData });

  // Bust the Next.js full-route cache for any customer-facing page that
  // renders restaurant profile data. Without this, owners hit "Save"
  // and don't see their banner / logo / hours change on the live site
  // until the next deploy or natural cache expiry. We revalidate the
  // hosted-site routes specifically (path-scoped — no app-wide bust).
  // Best-effort: if revalidatePath throws (rare; runtime quirks),
  // we still return success since the DB write succeeded.
  const slug = (await prisma.restaurant
    .findUnique({ where: { id: restaurantId }, select: { slug: true } })
    .catch(() => null))?.slug;
  if (slug) {
    try { revalidatePath(`/site/${slug}`); } catch { /* noop */ }
    try { revalidatePath(`/order/${slug}`); } catch { /* noop */ }
  }

  return NextResponse.json({ success: true });
}
