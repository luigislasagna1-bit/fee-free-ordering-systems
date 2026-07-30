/**
 * READ-ONLY: final FIRSTBUY proof — inspect Luigi's fresh-identity test order
 * cmrrb5te4000204ky3trfq7my on PROD: promoDiscount, appliedPromos, payment,
 * plus the PromotionUsage ledger row and the promo's usedCount.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
const m = readFileSync(".env.local", "utf8").match(/^#\s*DATABASE_URL="(postgresql:\/\/[^"]*ep-dawn-tree[^"]*)"/m);
if (!m) throw new Error("no prod url");
const ORDER_ID = "cmrrb5te4000204ky3trfq7my";
const PROMO_ID = "cmq73x6lq000204l29joc0njb";
async function main() {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: m![1] }) } as any);
  const o = await p.order.findUnique({
    where: { id: ORDER_ID },
    select: {
      orderNumber: true, status: true, paymentStatus: true, 
      subtotal: true, promoDiscount: true, couponDiscount: true, total: true,
      appliedPromos: true, createdAt: true,
    },
  });
  console.log("ORDER:", JSON.stringify(o, null, 2));
  const usage = await p.promotionUsage.findMany({
    where: { promotionId: PROMO_ID },
    select: { orderId: true, createdAt: true },
  });
  console.log("PromotionUsage rows for FIRSTBUY:", JSON.stringify(usage));
  const promo = await p.promotion.findUnique({ where: { id: PROMO_ID }, select: { usedCount: true, isActive: true } });
  console.log("PROMO:", JSON.stringify(promo));
  const promos = (o?.appliedPromos ?? []) as any[];
  const hit = Array.isArray(promos) && promos.some((x) => x.promoId === PROMO_ID);
  const pass = !!o && Number(o.promoDiscount) > 0 && hit && o.paymentStatus === "paid";
  console.log(pass ? "\nPASS: FIRSTBUY discount is on the CHARGED order" : "\nFAIL: see fields above");
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
