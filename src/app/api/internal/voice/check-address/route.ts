import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { resolveAddress } from "@/lib/nominatim";
import { findZoneForPoint, type ZoneLike } from "@/lib/geocode";

// Prisma + Nominatim: node runtime only.
export const runtime = "nodejs";

const money = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: (currency || "usd").toUpperCase() }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
};

/**
 * POST /api/internal/voice/check-address
 *
 * The `check_delivery_address` tool. Turns a spoken address into a real answer
 * — do we deliver there, what does it cost, what's the minimum — WHILE THE
 * CALLER IS STILL ON THE PHONE, before a single item goes on the order.
 *
 * 🚨 THIS MUST STAY BYTE-FOR-BYTE THE SAME RESOLUTION AS THE CHARGE.
 * It deliberately calls the exact two functions `/api/orders` calls, with the
 * exact same arguments:
 *
 *     resolveAddress({ address, city, zip, country }, { preciseOnly: true })
 *     findZoneForPoint(zones, restaurant.lat, restaurant.lng, lat, lng)
 *
 * Any cheaper approximation here (a different geocoder, a looser rung, skipping
 * preciseOnly) re-creates the exact defect this feature exists to kill: a quote
 * and a charge that are two independent answers. That split is what billed
 * Ben Bilton $7.99 he didn't owe, and what let 7 orders in 90 days be charged
 * an average $22.57 against a $7.99 zone fee. `preciseOnly` matters especially:
 * a city-centroid match would drop every caller into the innermost zone.
 *
 * WHY IT ALSO RETURNS COORDS. The caller of this endpoint (the voice service)
 * keeps `lat`/`lng` and passes them to place_order, which forwards them as
 * deliveryLat/deliveryLng. That is what stops a phone order landing in the
 * "third state" — `deliveryZoneUnverified`, billed the restaurant's flat
 * `deliveryFee` instead of the zone's. Voice orders have been landing there
 * every time, because the service never sent coordinates at all.
 *
 * OUT-OF-ZONE IS NOT A REFUSAL. Matching the order route (Luigi 2026-06-08):
 * beyond every zone we still quote — using the OUTERMOST zone's fee and
 * minimum, the closest thing to that address — and let the restaurant decide.
 * And an address we cannot locate must NEVER dead-end the caller: hard-blocking
 * on an unlocatable address is precisely what stranded a real customer on
 * 2026-08-01. We report `located: false` and let the agent ask for a better
 * address, then fall back to taking the order the way it always did.
 */

type Body = {
  slug?: string;
  street?: string;
  city?: string;
  zip?: string;
};

export async function POST(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad JSON", code: "bad_json" }, { status: 400 });
  }

  const slug = (body.slug || "").toLowerCase().trim();
  const street = (body.street || "").trim();
  const city = (body.city || "").trim();
  const zip = (body.zip || "").trim();

  if (!slug) return NextResponse.json({ error: "Missing slug", code: "missing_slug" }, { status: 400 });
  if (!street) return NextResponse.json({ error: "Missing street", code: "missing_street" }, { status: 400 });

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: { id: true, lat: true, lng: true, country: true, currency: true, deliveryFee: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });
  }

  // Same scope as the order route: the restaurant's own active zones.
  const zones = await prisma.deliveryZone.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
  });

  // A zoneless store never verified addresses and shouldn't start now — it has
  // one flat fee and no notion of "outside". Say so plainly rather than
  // inventing a check that can only produce false worry.
  if (zones.length === 0 || restaurant.lat == null || restaurant.lng == null) {
    return NextResponse.json({
      hasZones: false,
      located: null,
      deliveryFee: restaurant.deliveryFee ?? null,
      currency: restaurant.currency,
      instruction:
        "This restaurant does not use delivery zones, so there is nothing to check — any address in its area is fine. Take the address and carry on.",
    });
  }

  const coords = await resolveAddress(
    { address: street, city, zip, country: restaurant.country },
    { preciseOnly: true },
  );

  if (!coords) {
    return NextResponse.json({
      hasZones: true,
      located: false,
      currency: restaurant.currency,
      instruction:
        "That address could not be pinned down. Do NOT refuse the order and do not say anything about maps or systems. " +
        "Ask once for the missing piece in plain words — the house number, or the cross street, or the postcode — and call this again. " +
        "If it still can't be found, carry on and take the order anyway; the store will confirm the delivery details.",
    });
  }

  const resolved = findZoneForPoint(
    zones as unknown as ZoneLike[],
    restaurant.lat,
    restaurant.lng,
    coords.lat,
    coords.lng,
  );

  // findZoneForPoint only returns null when there are no active zones, which is
  // already handled above — but never assume it.
  if (!resolved) {
    return NextResponse.json({
      hasZones: true,
      located: true,
      lat: coords.lat,
      lng: coords.lng,
      currency: restaurant.currency,
      instruction: "Address found. Carry on and take the order.",
    });
  }

  const { zone, inside, distanceKm } = resolved;

  // FREE DELIVERY (Luigi 2026-08-16): quoting "seven ninety-nine" alone is
  // scary when the store gives free delivery over a threshold. Find the live
  // free_delivery promotion that applies to THIS zone and hand the threshold
  // back so it is said in the same breath as the fee. Same rules the order
  // engine applies (active, auto, dated, not member-only, delivery allowed,
  // zone allowed) — the quote/charge stays authoritative.
  const now = new Date();
  const freePromos = await prisma.promotion.findMany({
    where: {
      restaurantId: restaurant.id,
      isActive: true,
      autoApply: true,
      promotionType: "free_delivery",
      groupLinks: { none: {} },
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    select: { minimumOrder: true, deliveryZoneIds: true, orderType: true },
    take: 10,
  });
  const zoneId = String((zone as { id?: unknown }).id ?? "");
  let freeDeliveryOver: number | null = null;
  // Outside every zone the fee is "what it would cost" and the store decides —
  // no free-delivery promise there.
  for (const p of inside ? freePromos : []) {
    const ot = String(p.orderType ?? "both");
    if (ot !== "both" && !/delivery/i.test(ot)) continue;
    let zoneOk = true;
    if (p.deliveryZoneIds) {
      try {
        const ids = JSON.parse(p.deliveryZoneIds);
        if (Array.isArray(ids) && ids.length) zoneOk = ids.map(String).includes(zoneId);
      } catch {
        zoneOk = true;
      }
    }
    if (!zoneOk) continue;
    const min = Number(p.minimumOrder) || 0;
    if (freeDeliveryOver === null || min < freeDeliveryOver) freeDeliveryOver = min;
  }
  const freeLine =
    freeDeliveryOver === null
      ? ""
      : freeDeliveryOver > 0
        ? ` In the SAME breath say delivery is FREE on orders over ${money(freeDeliveryOver, restaurant.currency)} (freeDeliveryOver) — never quote the fee bare.`
        : " In the SAME breath say delivery is FREE here (freeDeliveryOver 0) — the fee only applies if a deal doesn't.";

  return NextResponse.json({
    hasZones: true,
    located: true,
    inside,
    // Kept by the voice service and sent to place_order as deliveryLat/Lng, so
    // the ORDER resolves the same zone this quote did.
    lat: coords.lat,
    lng: coords.lng,
    matchedAddress: coords.label,
    zoneName: zone.name,
    deliveryFee: zone.deliveryFee,
    minimumOrder: zone.minimumOrder,
    estimatedMinutes: zone.estimatedMinutes,
    distanceKm: Math.round(distanceKm * 10) / 10,
    currency: restaurant.currency,
    freeDeliveryOver,
    instruction: inside
      ? "We deliver to this address. Confirm the street back to the caller in plain words, tell them the delivery fee" +
        (zone.minimumOrder > 0 ? " and the minimum order" : "") +
        freeLine +
        ", then take their food order. Never read out the zone name, the distance, or the matched address string — those are for you, not for them."
      : "This address is BEYOND every delivery zone. Say warmly that it is outside the usual delivery area, give this fee" +
        (zone.minimumOrder > 0 ? " and this minimum" : "") +
        " as what it would cost, and let the caller decide — do not refuse it and do not promise it will definitely be accepted. If they would rather not, offer pickup. Never read out the zone name or the distance.",
  });
}
