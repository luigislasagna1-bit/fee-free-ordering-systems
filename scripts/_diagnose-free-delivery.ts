/**
 * READ-ONLY: "this order qualified for free delivery — why was it charged?"
 *
 * Written 2026-07-31 for Luigi's order #ORD-369250179 ($84.94 subtotal, $7.99
 * delivery charged, while a "Free Delivery, $30 min, delivery only" promo was
 * live). Prints the order's stored money, which promos it actually consumed,
 * and then every free-delivery promo on the store checked gate by gate — so the
 * blocking condition names itself instead of being guessed at.
 *
 * Writes NOTHING.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_diagnose-free-delivery.ts <order-number>
 * e.g.
 *   npx tsx scripts/run-on-prod.ts scripts/_diagnose-free-delivery.ts ORD-369250179
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
if (!arg) {
  console.error("Usage: npx tsx scripts/run-on-prod.ts scripts/_diagnose-free-delivery.ts <order-number>");
  process.exit(1);
}
const orderNumber = arg.replace(/^#/, "");

const money = (n: number | null | undefined) => "$" + (Number(n) || 0).toFixed(2);
const yn = (b: boolean) => (b ? "yes" : "NO");

/** Mirrors the engine's jsonStringList: a restriction is only ACTIVE when the
 *  column holds a non-empty list. Null / "" / "[]" all mean "no restriction". */
function parseList(v: unknown): string[] | null {
  if (v == null) return null;
  let arr: unknown = v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    try { arr = JSON.parse(s); } catch { return [s]; }
  }
  if (!Array.isArray(arr)) return null;
  const out = arr.map(String).filter(Boolean);
  return out.length ? out : null;
}

async function main() {
  const order = await prisma.order.findFirst({
    where: { orderNumber: { contains: orderNumber } },
    select: {
      id: true, orderNumber: true, restaurantId: true, type: true, status: true, createdAt: true,
      subtotal: true, deliveryFee: true, tip: true, taxAmount: true, total: true,
      promoDiscount: true, couponDiscount: true, viaMarketplace: true, paymentMethod: true,
      customerEmail: true, customerPhone: true, customerId: true, deliveryZoneId: true,
      restaurant: { select: { name: true, slug: true } },
    },
  });
  if (!order) { console.error(`No order matching "${orderNumber}".`); process.exit(1); }

  console.log(`\n=== ORDER ${order.orderNumber} — ${order.restaurant.name} ===`);
  console.log(`  placed ${order.createdAt.toISOString()} | type=${order.type} | status=${order.status} | marketplace=${order.viaMarketplace}`);
  console.log(`  subtotal ${money(order.subtotal)}  delivery ${money(order.deliveryFee)}  tip ${money(order.tip)}  tax ${money(order.taxAmount)}`);
  console.log(`  promoDiscount ${money(order.promoDiscount)}  couponDiscount ${money(order.couponDiscount)}  TOTAL ${money(order.total)}`);
  console.log(`  customer: ${order.customerEmail ?? "(none)"} / ${order.customerPhone ?? "(none)"} | zone=${order.deliveryZoneId ?? "(none)"}`);

  // What actually applied
  const usages = await prisma.promotionUsage.findMany({
    where: { orderId: order.id },
    select: { promotion: { select: { id: true, name: true, promotionType: true, stackingRule: true } } },
  });
  console.log(`\n--- Promotions this order actually consumed: ${usages.length} ---`);
  for (const u of usages) {
    console.log(`  ${u.promotion.name}  [${u.promotion.promotionType}, ${u.promotion.stackingRule}]`);
  }
  if (!usages.length) console.log("  (none recorded)");
  const gotFreeDelivery = usages.some((u) => u.promotion.promotionType === "free_delivery");
  console.log(`  free delivery among them: ${yn(gotFreeDelivery)}`);

  // Every free-delivery promo, checked gate by gate against THIS order.
  const fds = await prisma.promotion.findMany({
    where: { restaurantId: order.restaurantId, promotionType: "free_delivery" },
    select: {
      id: true, name: true, isActive: true, autoApply: true, couponCode: true, displayMode: true,
      stackingRule: true, customerType: true, orderType: true, minimumOrder: true, channel: true,
      startsAt: true, endsAt: true, usageLimit: true, usedCount: true, onceLifetimePerClient: true,
      ruleConfig: true, scope: true,
      // The four gates the first version of this script missed — one of them is
      // the answer whenever everything else "looks like it should have applied".
      deliveryZoneIds: true, paymentMethodSlugs: true, limitedShowtimeSchedules: true,
    },
  });

  console.log(`\n--- Free-delivery promos on this store: ${fds.length} ---`);
  for (const p of fds) {
    console.log(`\n  "${p.name}"`);
    const reasons: string[] = [];

    if (!p.isActive) reasons.push("promo is INACTIVE");
    if (!p.autoApply) {
      reasons.push(
        `autoApply is FALSE — it only applies when the customer enters the code${p.couponCode ? ` "${p.couponCode}"` : ""} (or taps the tile to claim it). It will NEVER apply on its own.`,
      );
    }
    if (p.orderType && p.orderType !== "both" && p.orderType !== order.type) {
      reasons.push(`orderType is "${p.orderType}" but this order is "${order.type}"`);
    }
    if ((p.minimumOrder ?? 0) > (order.subtotal ?? 0)) {
      reasons.push(`minimum order ${money(p.minimumOrder)} > this subtotal ${money(order.subtotal)}`);
    }
    if (p.customerType === "member") {
      reasons.push('customerType is "member" — refused unless the customer was SIGNED IN when ordering');
    }
    if (p.customerType === "new") reasons.push('customerType is "new" — only a first-ever order qualifies');
    if (p.customerType === "returning") reasons.push('customerType is "returning" — a first-ever order does not qualify');
    const ch = p.channel;
    if (ch && ch !== "both" && ((ch === "marketplace") !== order.viaMarketplace)) {
      reasons.push(`channel is "${ch}" but this order came via ${order.viaMarketplace ? "marketplace" : "website"}`);
    }
    if (p.startsAt && order.createdAt < p.startsAt) reasons.push(`starts ${p.startsAt.toISOString()} — after this order`);
    if (p.endsAt && order.createdAt > p.endsAt) reasons.push(`ended ${p.endsAt.toISOString()} — before this order`);
    if (p.usageLimit != null && p.usedCount >= p.usageLimit) {
      reasons.push(`global usage limit reached (${p.usedCount}/${p.usageLimit})`);
    }
    if (p.stackingRule === "exclusive") {
      reasons.push('stackingRule is "exclusive" — it competes with other exclusive deals and only the single best one is applied');
    }

    // ── DELIVERY ZONE — the gate most likely to be invisible to the owner ────
    // promo-engine: if deliveryZoneIds is set at all, a delivery order must have
    // resolved to a zone AND that zone must be in the list. An address that
    // geocoded outside every zone (or failed to geocode) has no zone, so the
    // promo is refused even though the order is delivery and over the minimum.
    const zoneList = parseList(p.deliveryZoneIds);
    if (zoneList) {
      if (order.type !== "delivery") {
        reasons.push("promo is zone-restricted and this is not a delivery order");
      } else if (!order.deliveryZoneId) {
        reasons.push(
          "promo is restricted to specific delivery zones, but THIS ORDER HAS NO ZONE — the address did not resolve into one of your zones, so the promo was refused",
        );
      } else if (!zoneList.includes(order.deliveryZoneId)) {
        reasons.push(`promo is restricted to zones [${zoneList.join(", ")}] but this order is in zone ${order.deliveryZoneId}`);
      }
    }

    // ── PAYMENT METHOD ──────────────────────────────────────────────────────
    const payList = parseList(p.paymentMethodSlugs);
    if (payList && order.paymentMethod) {
      const slug = order.paymentMethod === "card" ? "online_card" : order.paymentMethod;
      if (!payList.includes(slug)) {
        reasons.push(`promo is limited to payment methods [${payList.join(", ")}] but this order paid by "${order.paymentMethod}"`);
      }
    }

    // ── HAPPY-HOUR / LIMITED SHOWTIME ───────────────────────────────────────
    const sched = p.limitedShowtimeSchedules;
    const schedArr = Array.isArray(sched) ? sched : [];
    if (schedArr.length > 0) {
      reasons.push(
        `promo has ${schedArr.length} day/time window(s) — it only applies inside them. Order was placed ${order.createdAt.toISOString()}. Windows: ${JSON.stringify(sched)}`,
      );
    }

    // ── ONCE PER CUSTOMER ───────────────────────────────────────────────────
    if (p.onceLifetimePerClient) {
      const priorUse = await prisma.promotionUsage.count({
        where: {
          promotionId: p.id,
          orderId: { not: order.id },
        },
      });
      reasons.push(
        `once-per-customer is ON (${priorUse} prior use(s) of this promo across all customers) — if this customer had used it before, it is refused`,
      );
    }

    console.log(`    active=${p.isActive} autoApply=${p.autoApply} code=${p.couponCode ?? "-"} display=${p.displayMode}`);
    console.log(`    stacking=${p.stackingRule} customerType=${p.customerType} orderType=${p.orderType} minOrder=${money(p.minimumOrder)} channel=${p.channel}`);
    const rc = (p.ruleConfig ?? {}) as Record<string, unknown>;
    const dayHour = ["days", "daysOfWeek", "startTime", "endTime", "hours"].filter((k) => rc[k] != null);
    if (dayHour.length) console.log(`    time restrictions present in ruleConfig: ${dayHour.map((k) => `${k}=${JSON.stringify(rc[k])}`).join("  ")}`);

    if (reasons.length === 0) {
      console.log(`    => nothing here explains it. This promo LOOKS like it should have applied.`);
      console.log(`       Remaining suspects: a day/time window in ruleConfig, a delivery-zone restriction,`);
      console.log(`       once-per-customer already used, or another EXCLUSIVE promo winning the slot.`);
    } else {
      console.log(`    => WOULD NOT APPLY because:`);
      for (const r of reasons) console.log(`       - ${r}`);
    }
  }
  if (!fds.length) console.log("  (this store has no free-delivery promo at all)");

  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
