/**
 * READ-ONLY post-verify (after Luigi's "Give" click attached Erik):
 * live /api/public/apply-promos preview AS ERIK'S REAL EMAIL (pulled from the DB
 * inside this script — PII never on the command line, masked in output) →
 * expect the $10 make-good applied; FIRSTBUY should NOT apply (he's returning).
 * Writes nothing; previews never consume once-lifetime/usageLimit.
 * Run: npx tsx scripts/_postverify-erick-gift.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const m = readFileSync(".env.local", "utf8").match(/^#\s*DATABASE_URL="(postgresql:\/\/[^"]*ep-dawn-tree[^"]*)"/m);
if (!m) throw new Error("Prod URL not found");

const SLUG = "luigis-lasagna-pizzeria";
const ERIK_CUSTOMER_ID = "cmrp4cvwi000009jf9up6ctgb";
const PROMO_NAME = "Sorry we missed your discount — $10 on us";
const HOST = "https://luigispizzapastawings.com";

async function main() {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: m![1] }) } as any);
  const erik = await p.customer.findUnique({ where: { id: ERIK_CUSTOMER_ID }, select: { email: true } });
  if (!erik?.email) throw new Error("Erik's email not found");
  const item = await p.menuItem.findUnique({
    where: { id: "cmpuex6m30azl04kv7xua0mhg" },
    select: { id: true, name: true, price: true },
  });
  if (!item) throw new Error("proof item missing");
  await p.$disconnect();

  const qty = item.price * 2 > 10.01 ? 2 : 3;
  const subtotal = Math.round(item.price * qty * 100) / 100;
  const res = await fetch(`${HOST}/api/public/apply-promos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restaurantSlug: SLUG, orderType: "pickup", channel: "website", subtotal,
      items: [{ menuItemId: item.id, name: item.name, price: item.price, quantity: qty, subtotal }],
      email: erik.email,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as any;
  const applied = (json.applied ?? []).map((a: any) => ({ name: a.name, discount: a.discount }));
  console.log("ERIK (real email, masked", erik.email.slice(0, 3) + "***):",
    "subtotal", subtotal, "applied:", JSON.stringify(applied), "totalDiscount:", json.totalDiscount);
  const hit = applied.find((a: any) => a.name === PROMO_NAME);
  const firstbuy = applied.find((a: any) => /first/i.test(a.name ?? ""));
  const pass = !!hit && Math.abs(Number(hit.discount) - 10) < 0.005;
  console.log(pass ? "✅ PASS: Erik's real email gets -$10 automatically" : "❌ FAIL");
  console.log(firstbuy ? "note: FIRSTBUY also applied (unexpected — he should be returning)" : "FIRSTBUY correctly absent (returning customer)");
  if (!pass) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
