/**
 * READ-ONLY diagnostic (2026-08-13): what address strings do we actually hand
 * ShipDay, and would Uber Direct be able to geocode them?
 *
 * Uber ALWAYS geocodes the dropoff ADDRESS STRING (even when lat/lng is sent);
 * DoorDash honours the coordinates. So a string missing state/country explains
 * "out of delivery area" on Uber while DoorDash attaches fine.
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { buildDropoffAddress, buildPickupAddress, buildDeliveryInstruction, singleLineAddress } from "../src/lib/shipday-address";
config({ path: ".env.local" });
config({ path: ".env" });

function allDatabaseUrls(): string[] {
  const raw = readFileSync(".env.local", "utf8").split(/\r?\n/);
  const urls: string[] = [];
  for (const line of raw) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !urls.includes(m[1])) urls.push(m[1]);
  }
  return urls;
}

async function main() {
  for (const url of allDatabaseUrls()) {
    console.log(`\n\n########## BRANCH: ${url.replace(/:\/\/[^@]*@/, "://***@").slice(0, 90)} ##########`);
    await inspect(url).catch((e) => console.error("  FAILED:", e.message));
  }
}

async function inspect(url: string) {
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);

  const configs = await p.shipdayConfig.findMany({
    where: { deliverySource: { not: "own" } },
    select: {
      restaurantId: true, enabled: true, deliverySource: true, activeDispatchMode: true,
      restaurant: { select: { name: true, address: true, city: true, state: true, zip: true, country: true, lat: true, lng: true, phone: true } },
    },
  });

  console.log("=== ShipDay-configured restaurants ===");
  for (const c of configs) {
    const r = c.restaurant;
    const restaurantAddress = [r.address, r.city, r.state, r.zip].filter(Boolean).join(", ");
    console.log(`\n${r.name}  (enabled=${c.enabled} source=${c.deliverySource}/${c.activeDispatchMode})`);
    console.log(`  Restaurant.country column : ${JSON.stringify(r.country)}`);
    console.log(`  restaurantAddress SENT    : ${JSON.stringify(restaurantAddress)}`);
    console.log(`  pickupLat/Lng SENT        : ${r.lat ?? "NULL"} , ${r.lng ?? "NULL"}`);
    console.log(`  restaurantPhone           : ${JSON.stringify(r.phone)}`);

    const orders = await p.order.findMany({
      where: { restaurantId: c.restaurantId, type: "delivery" },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        orderNumber: true, createdAt: true, deliveryAddress: true, deliveryCity: true,
        deliveryZip: true, deliveryLat: true, deliveryLng: true, deliveryAddressData: true,
        shipdayOrderId: true, shipdayStatus: true, customerPhone: true, notes: true,
      },
    });
    console.log(`  --- last ${orders.length} delivery orders ---`);
    console.log(`  restaurantAddress AFTER   : ${JSON.stringify(singleLineAddress(buildPickupAddress(r)))}`);
    for (const o of orders) {
      const before = [o.deliveryAddress, o.deliveryCity, o.deliveryZip].filter(Boolean).join(", ");
      const dropoff = buildDropoffAddress({
        deliveryAddress: o.deliveryAddress,
        deliveryCity: o.deliveryCity,
        deliveryZip: o.deliveryZip,
        deliveryAddressData: o.deliveryAddressData,
        restaurantState: r.state,
        restaurantCountry: r.country,
      });
      console.log(
        `   #${o.orderNumber} ${o.createdAt.toISOString().slice(0, 10)} ` +
          `shipday=${o.shipdayOrderId ?? "-"}/${o.shipdayStatus ?? "-"}`,
      );
      console.log(`      BEFORE : ${JSON.stringify(before)}`);
      console.log(`      AFTER  : ${JSON.stringify(singleLineAddress(dropoff))}`);
      console.log(`      dropoff: ${JSON.stringify(dropoff)}`);
      const instr = buildDeliveryInstruction(o.notes, o.deliveryAddressData);
      if (instr) console.log(`      instr  : ${JSON.stringify(instr)}`);
    }
  }

  // How often is each field even populated, platform-wide?
  const total = await p.order.count({ where: { type: "delivery" } });
  const noZip = await p.order.count({ where: { type: "delivery", OR: [{ deliveryZip: null }, { deliveryZip: "" }] } });
  const noCity = await p.order.count({ where: { type: "delivery", OR: [{ deliveryCity: null }, { deliveryCity: "" }] } });
  const noCoords = await p.order.count({ where: { type: "delivery", OR: [{ deliveryLat: null }, { deliveryLng: null }] } });
  console.log(`\n=== platform-wide delivery orders: ${total} ===`);
  console.log(`  missing deliveryZip : ${noZip}`);
  console.log(`  missing deliveryCity: ${noCity}`);
  console.log(`  missing coords      : ${noCoords}`);
  console.log(`  NOTE: no order column stores STATE/PROVINCE or COUNTRY at all.`);
}

main().then(() => process.exit(0));
