/**
 * Live ShipDay probe for the Uber "out of delivery area" fix (2026-08-13).
 *
 * Nothing runs without an explicit verb — this script touches a REAL ShipDay
 * account, so it never acts on import.
 *
 *   npx tsx scripts/_probe-shipday-uber-payload.ts preview
 *       Print the exact JSON we would POST for the newest real delivery order.
 *       Touches nothing.
 *
 *   npx tsx scripts/_probe-shipday-uber-payload.ts create
 *       POST ONE order to ShipDay, order number ZZ-UBERTEST-<epoch>, using a
 *       real recent delivery address so the geocode is representative.
 *       Creating an order does NOT dispatch a courier — in ShipDay a human
 *       still has to pick DoorDash/Uber and accept a quote.
 *
 *   npx tsx scripts/_probe-shipday-uber-payload.ts inspect <orderNumber>
 *       Read the order back so we can see which fields ShipDay actually stored
 *       (this is what settles whether `pickup`/`dropoff` land flat or nested).
 *
 *   npx tsx scripts/_probe-shipday-uber-payload.ts delete <shipdayOrderId>
 *       Remove the test order again.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { decrypt } from "../src/lib/encrypt";
import { buildShipdayOrderBody } from "../src/lib/shipday-payload";
import { buildDeliveryInstruction, buildDropoffAddress, buildPickupAddress } from "../src/lib/shipday-address";
config({ path: ".env.local" });
config({ path: ".env" });

const BASE = "https://api.shipday.com";

/** The PROD branch is the pooler URL; the probe is meaningless against dev. */
function prodDatabaseUrl(): string {
  const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);
  const urls: string[] = [];
  for (const l of lines) {
    const m = l.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !urls.includes(m[1])) urls.push(m[1]);
  }
  const prod = urls.find((u) => /pooler/.test(u)) ?? urls[urls.length - 1];
  if (!prod) throw new Error("No DATABASE_URL found in .env.local");
  return prod;
}

function client() {
  const url = prodDatabaseUrl();
  const adapter = /\.neon\.tech([:/?]|$)/i.test(url)
    ? new PrismaNeon({ connectionString: url })
    : new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter } as any);
}

async function loadContext(opts: { needKey: boolean }) {
  const p = client();
  const cfg = await p.shipdayConfig.findFirst({
    where: { enabled: true, deliverySource: { not: "own" } },
    select: {
      restaurantId: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true,
      restaurant: { select: { name: true, address: true, city: true, state: true, zip: true, country: true, phone: true, lat: true, lng: true } },
    },
  });
  if (!cfg?.apiKeyEnc || !cfg.apiKeyIv || !cfg.apiKeyTag) throw new Error("No ShipDay-enabled restaurant with credentials");
  // `preview` never calls ShipDay, so it must not need the key — and it can't
  // have it anyway: the stored key is sealed with the PRODUCTION
  // ENCRYPTION_KEY, which a local checkout does not hold.
  let apiKey = "";
  if (opts.needKey) {
    try {
      apiKey = decrypt(cfg.apiKeyEnc, cfg.apiKeyIv, cfg.apiKeyTag);
    } catch {
      throw new Error(
        "Cannot decrypt the ShipDay key with this ENCRYPTION_KEY — the live key is sealed with the production one. Run the create/inspect/delete verbs from an environment that has it, or verify from the ShipDay dashboard instead.",
      );
    }
  }

  const order = await p.order.findFirst({
    where: { restaurantId: cfg.restaurantId, type: "delivery", deliveryAddress: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      customerName: true, customerEmail: true, customerPhone: true,
      deliveryAddress: true, deliveryCity: true, deliveryZip: true,
      deliveryAddressData: true, deliveryLat: true, deliveryLng: true, notes: true,
    },
  });
  if (!order) throw new Error("No delivery order to model the probe on");
  return { apiKey, restaurant: cfg.restaurant, order };
}

async function buildBody(orderNumber: string, needKey: boolean) {
  const { apiKey, restaurant, order } = await loadContext({ needKey });
  const body = buildShipdayOrderBody(
    {
      orderId: `probe-${orderNumber}`,
      orderNumber,
      // Deliberately obvious in the dashboard, so nobody mistakes it for a sale.
      customerName: "ZZ TEST — Uber geocode probe (delete me)",
      customerEmail: null,
      customerPhone: order.customerPhone,
      dropoff: buildDropoffAddress({
        deliveryAddress: order.deliveryAddress,
        deliveryCity: order.deliveryCity,
        deliveryZip: order.deliveryZip,
        deliveryAddressData: order.deliveryAddressData,
        restaurantState: restaurant.state,
        restaurantCountry: restaurant.country,
      }),
      customerLat: order.deliveryLat,
      customerLng: order.deliveryLng,
      restaurantName: restaurant.name,
      pickup: buildPickupAddress(restaurant),
      restaurantPhone: restaurant.phone,
      restaurantLat: restaurant.lat,
      restaurantLng: restaurant.lng,
      subtotal: 10, taxAmount: 1.3, deliveryFee: 7.99, tip: 0, total: 19.29,
      creditApplied: 0, preparationMinutes: 30,
      deliveryInstruction: buildDeliveryInstruction(order.notes, order.deliveryAddressData) ?? null,
      items: [{ name: "ZZ TEST ITEM", quantity: 1, unitPrice: 10 }],
    },
    new Date(),
  );
  return { apiKey, body };
}

async function main() {
  const [verb, arg] = process.argv.slice(2);

  if (verb === "preview") {
    const { body } = await buildBody("ZZ-UBERTEST-PREVIEW", false);
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  if (verb === "create") {
    const orderNumber = `ZZ-UBERTEST-${Math.floor(Date.now() / 1000)}`;
    const { apiKey, body } = await buildBody(orderNumber, true);
    console.log("POST /orders\n", JSON.stringify(body, null, 2));
    const res = await fetch(`${BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${apiKey}` },
      body: JSON.stringify(body),
    });
    console.log(`\nHTTP ${res.status}\n${await res.text()}`);
    console.log(`\norderNumber = ${orderNumber}`);
    return;
  }

  if (verb === "inspect") {
    if (!arg) throw new Error("inspect needs an order number");
    const { apiKey } = await loadContext({ needKey: true });
    const res = await fetch(`${BASE}/orders/${encodeURIComponent(arg)}`, {
      headers: { Authorization: `Basic ${apiKey}` },
    });
    console.log(`HTTP ${res.status}\n${JSON.stringify(JSON.parse(await res.text()), null, 2)}`);
    return;
  }

  if (verb === "delete") {
    if (!arg) throw new Error("delete needs a ShipDay order id");
    const { apiKey } = await loadContext({ needKey: true });
    const res = await fetch(`${BASE}/orders/${encodeURIComponent(arg)}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${apiKey}` },
    });
    console.log(`HTTP ${res.status}\n${await res.text()}`);
    return;
  }

  console.log("Usage: preview | create | inspect <orderNumber> | delete <shipdayOrderId>");
}

main().then(() => process.exit(0));
