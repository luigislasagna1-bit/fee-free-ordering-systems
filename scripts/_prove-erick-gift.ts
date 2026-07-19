/**
 * PROOF (write-free on the app side) + cleanup for Erik's staged $10 make-good:
 *   1. Live /api/public/apply-promos preview AS the attached TEST identity →
 *      must show the $10 fixed_cart discount (promo cmrrdvhzb0000ukvhnqyiljnf).
 *   2. Same cart AS an unattached identity → must NOT show it (locked to email).
 *   3. Delete the test target row so the ONLY attach ever made for a real person
 *      is the one Luigi's "Give a VIP special" click creates (that click = email).
 * The preview API writes nothing and never consumes once-lifetime (FIRSTBUY-verified).
 * Run: npx tsx scripts/_prove-erick-gift.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const m = readFileSync(".env.local", "utf8").match(/^#\s*DATABASE_URL="(postgresql:\/\/[^"]*ep-dawn-tree[^"]*)"/m);
if (!m) throw new Error("Prod URL not found");

const RESTAURANT_ID = "cmp7xhd3900000al2jz0db5vi";
const SLUG = "luigis-lasagna-pizzeria";
const PROMO_ID = "cmrrdvhzb0000ukvhnqyiljnf";
const TEST_EMAIL = "luigislasagna1+erickcheck@gmail.com";      // attached
const STRANGER_EMAIL = "luigislasagna1+notattached@gmail.com"; // NOT attached
const HOSTS = ["https://luigispizzapastawings.com", "https://www.feefreeordering.com"];

async function preview(host: string, email: string, item: { id: string; name: string; price: number }) {
  const qty = item.price * 2 > 10.01 ? 2 : 3; // cart must exceed $10 so the full credit shows
  const subtotal = Math.round(item.price * qty * 100) / 100;
  const res = await fetch(`${host}/api/public/apply-promos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restaurantSlug: SLUG,
      orderType: "pickup",
      channel: "website",
      subtotal,
      items: [{ menuItemId: item.id, name: item.name, price: item.price, quantity: qty, subtotal }],
      email,
    }),
  });
  if (!res.ok) throw new Error(`${host} → HTTP ${res.status}`);
  return { subtotal, json: (await res.json()) as any };
}

async function main() {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: m![1] }) } as any);
  const item =
    (await p.menuItem.findUnique({
      where: { id: "cmpuex6m30azl04kv7xua0mhg" },
      select: { id: true, name: true, price: true, isAvailable: true },
    })) ??
    (await p.menuItem.findFirst({
      where: { restaurantId: RESTAURANT_ID, isAvailable: true, price: { gt: 5 } },
      orderBy: { price: "asc" },
      select: { id: true, name: true, price: true, isAvailable: true },
    }));
  if (!item) throw new Error("no menu item for the proof cart");
  console.log("cart item:", JSON.stringify(item));

  let host = "";
  for (const h of HOSTS) {
    try { await preview(h, "probe@example.com", item); host = h; break; } catch (e) { console.log(`(${h} skipped: ${(e as Error).message})`); }
  }
  if (!host) throw new Error("no reachable host");
  console.log("host:", host);

  // applied[] entries carry {name, discount} (no promo id) — match on the name.
  const PROMO_NAME = "Sorry we missed your discount — $10 on us";
  const pos = await preview(host, TEST_EMAIL, item);
  const posHit = (pos.json.applied ?? []).find((a: any) => a.name === PROMO_NAME);
  console.log("POSITIVE (attached email): subtotal", pos.subtotal,
    "applied:", JSON.stringify((pos.json.applied ?? []).map((a: any) => ({ id: a.id ?? a.promotionId, name: a.name, discount: a.discount ?? a.discountAmount }))),
    "totalDiscount:", pos.json.totalDiscount);

  const neg = await preview(host, STRANGER_EMAIL, item);
  const negHit = (neg.json.applied ?? []).find((a: any) => a.name === PROMO_NAME);
  console.log("NEGATIVE (unattached email): applied:",
    JSON.stringify((neg.json.applied ?? []).map((a: any) => ({ id: a.id ?? a.promotionId, name: a.name, discount: a.discount ?? a.discountAmount }))),
    "totalDiscount:", neg.json.totalDiscount);

  const posDiscount = posHit ? Number(posHit.discount ?? posHit.discountAmount ?? 0) : 0;
  const pass = !!posHit && Math.abs(posDiscount - 10) < 0.005 && !negHit;
  console.log(pass ? "✅ PASS: $10 auto-applies for the attached email only" : "❌ FAIL — leaving test target in place for debugging");

  if (pass) {
    const del = await p.customerGroupPromotion.deleteMany({
      where: { promotionId: PROMO_ID, restaurantId: RESTAURANT_ID, groupId: null, email: TEST_EMAIL },
    });
    console.log(`test target deleted (${del.count} row) — promo is now attached to NOBODY until Luigi's click`);
  }
  await p.$disconnect();
  if (!pass) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
