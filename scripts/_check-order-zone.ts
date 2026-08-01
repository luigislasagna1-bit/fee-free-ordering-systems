/**
 * READ-ONLY: was this delivery address genuinely outside every zone, or did the
 * zone simply fail to resolve?
 *
 * Those look identical on the order (deliveryZoneId = null) but mean opposite
 * things:
 *   outsideDeliveryZone = true  -> it geocoded, it really is out of range.
 *                                  Zone-restricted promos correctly refused.
 *   outsideDeliveryZone = false -> nothing ever resolved a zone (geocode failed,
 *                                  was skipped, or the address arrived without
 *                                  coordinates). The customer may well have been
 *                                  INSIDE a zone and silently lost the promo.
 *
 * It then re-tests the stored coordinates against the CURRENT zones, so we can
 * see what the answer should have been.
 *
 * Writes NOTHING.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_check-order-zone.ts <order-number>
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error("DATABASE_URL is not set."); process.exit(1); }
const isNeon = /\.neon\.tech([:/?]|$)/i.test(connectionString);
const prisma = new PrismaClient({
  adapter: isNeon ? new PrismaNeon({ connectionString }) : new PrismaPg({ connectionString }),
} as any);

const arg = process.argv[2];
if (!arg) { console.error("Usage: ... _check-order-zone.ts <order-number>"); process.exit(1); }
const orderNumber = arg.replace(/^#/, "");

async function main() {
  const order = await prisma.order.findFirst({
    where: { orderNumber: { contains: orderNumber } },
    select: {
      orderNumber: true, restaurantId: true, type: true, createdAt: true,
      deliveryAddress: true, deliveryCity: true, deliveryZip: true,
      deliveryLat: true, deliveryLng: true,
      deliveryZoneId: true, outsideDeliveryZone: true, deliveryFee: true,
      restaurant: { select: { name: true, acceptOutsideZoneOrders: true } },
    },
  });
  if (!order) { console.error(`No order matching "${orderNumber}".`); process.exit(1); }

  console.log(`\n=== ${order.orderNumber} — ${order.restaurant.name} ===`);
  console.log(`  address : ${order.deliveryAddress ?? "(none)"}, ${order.deliveryCity ?? ""} ${order.deliveryZip ?? ""}`);
  console.log(`  coords  : ${order.deliveryLat ?? "(none)"}, ${order.deliveryLng ?? "(none)"}`);
  console.log(`  zone    : ${order.deliveryZoneId ?? "(none)"}`);
  console.log(`  outsideDeliveryZone flag : ${order.outsideDeliveryZone}`);
  console.log(`  store accepts out-of-zone: ${order.restaurant.acceptOutsideZoneOrders}`);
  console.log(`  delivery fee charged     : $${(order.deliveryFee ?? 0).toFixed(2)}`);

  console.log(`\n--- VERDICT ---`);
  if (order.deliveryZoneId) {
    console.log("  A zone WAS resolved. Zone restrictions were not the blocker.");
  } else if (order.outsideDeliveryZone) {
    console.log("  The address GEOCODED and landed outside every active zone.");
    console.log("  Zone-restricted promos correctly refused it — this is working as configured.");
    console.log("  Decide separately whether an out-of-zone order should still get free delivery.");
  } else {
    console.log("  ⚠️  NO zone resolved AND the out-of-zone flag was never set.");
    console.log("  That means nothing ever decided where this address was — the geocode did not");
    console.log("  run, failed, or returned no coordinates. The customer may have been INSIDE a");
    console.log("  qualifying zone and silently lost the promo. This is a defect, not a setting.");
  }

  // What would the answer be today?
  const zones = await prisma.deliveryZone.findMany({
    where: { restaurantId: order.restaurantId, isActive: true },
    select: { id: true, name: true, deliveryFee: true, minimumOrder: true, polygon: true, centerLat: true, centerLng: true, radiusKm: true },
  });
  console.log(`\n--- Re-testing the stored coordinates against ${zones.length} active zone(s) ---`);
  if (order.deliveryLat == null || order.deliveryLng == null) {
    console.log("  Cannot re-test: the order has NO stored coordinates.");
    console.log("  (That alone explains a missing zone — zone matching needs a lat/lng.)");
  } else {
    try {
      const { findZoneForPoint } = await import("../src/lib/geocode");
      const hit = findZoneForPoint(order.deliveryLat, order.deliveryLng, zones as any);
      if (hit && (hit as any).inside) {
        const z = (hit as any).zone;
        console.log(`  ⚠️  These coordinates ARE inside zone "${z.name}" today.`);
        console.log("  So the address was deliverable and should have qualified — the zone was");
        console.log("  simply not captured on the order. Defect confirmed.");
      } else {
        console.log("  These coordinates are NOT inside any active zone today.");
        console.log("  Consistent with a genuinely out-of-range address.");
      }
    } catch (e) {
      console.log(`  (could not re-test: ${e instanceof Error ? e.message : e})`);
    }
  }
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
