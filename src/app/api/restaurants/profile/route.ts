import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const {
    name, slogan, description, phone, email, address, city, state, zip, country, cuisineType,
    timezone, taxRate, minimumOrder, deliveryFee, estimatedPickup, estimatedDelivery,
    acceptsPickup, acceptsDelivery, acceptsDineIn, acceptsCatering,
    logoUrl, bannerUrl, reviewLink, infoContent, themeSettings,
    lat, lng,
    mapProvider, googleMapsApiKey,
    defaultLanguage,
    kitchenWorkflowMode,
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
  if (taxRate !== undefined) updateData.taxRate = taxRate;
  if (minimumOrder !== undefined) updateData.minimumOrder = minimumOrder;
  if (deliveryFee !== undefined) updateData.deliveryFee = deliveryFee;
  if (estimatedPickup !== undefined) updateData.estimatedPickup = estimatedPickup;
  if (estimatedDelivery !== undefined) updateData.estimatedDelivery = estimatedDelivery;
  if (acceptsPickup !== undefined) updateData.acceptsPickup = acceptsPickup;
  if (acceptsDelivery !== undefined) updateData.acceptsDelivery = acceptsDelivery;
  if (acceptsDineIn !== undefined) updateData.acceptsDineIn = acceptsDineIn;
  if (acceptsCatering !== undefined) updateData.acceptsCatering = acceptsCatering;
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
