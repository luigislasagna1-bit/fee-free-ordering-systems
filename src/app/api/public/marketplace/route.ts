import { NextRequest, NextResponse } from "next/server";
import { listPublicMarketplaceListings, MARKETPLACE_RADIUS_KM } from "@/lib/marketplace";
import { geocodeAddress } from "@/lib/geocode";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/marketplace?lat=&lng=  (or ?place=<postal/city>)
 *
 * The customer marketplace (feefreefood) queries this once it knows the visitor's
 * location — from device geolocation (lat/lng) or a typed postal code / city
 * (place, geocoded server-side). Returns only order-ready restaurants within 15km,
 * nearest first, with pickup/delivery flags + distance. No location → all eligible
 * (the page still nudges for a location).
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`mkt:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  let lat = numOrNull(searchParams.get("lat"));
  let lng = numOrNull(searchParams.get("lng"));
  const place = searchParams.get("place")?.trim().slice(0, 120) || "";
  let resolvedLabel: string | null = null;

  // A typed postal code / city → geocode to coordinates (device location skips this).
  if ((lat == null || lng == null) && place) {
    const geo = await geocodeAddress(place);
    if (!geo) {
      return NextResponse.json({ error: "location_not_found", listings: [] }, { status: 200 });
    }
    lat = geo.lat;
    lng = geo.lng;
    resolvedLabel = place;
  }

  const listings = await listPublicMarketplaceListings({ lat, lng, radiusKm: MARKETPLACE_RADIUS_KM });

  return NextResponse.json({
    radiusKm: MARKETPLACE_RADIUS_KM,
    located: lat != null && lng != null,
    location: lat != null && lng != null ? { lat, lng, label: resolvedLabel } : null,
    listings: listings.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      city: r.city,
      cuisineType: r.cuisineType,
      logoUrl: r.logoUrl,
      bannerUrl: r.bannerUrl,
      marketplaceBanner: r.marketplaceBanner,
      marketplaceTagline: r.marketplaceTagline,
      marketplaceTags: r.marketplaceTags,
      marketplaceFeatured: r.marketplaceFeatured,
      acceptsPickup: r.acceptsPickup,
      acceptsDelivery: r.acceptsDelivery,
      distanceKm: r.distanceKm != null ? Math.round(r.distanceKm * 10) / 10 : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
    })),
  });
}

function numOrNull(s: string | null): number | null {
  if (s == null || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
