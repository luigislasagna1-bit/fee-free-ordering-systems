/**
 * READ-ONLY: replay the REAL promo engine against a real order and report,
 * gate by gate, why a promotion did or did not apply.
 *
 * Written after two hand-rolled diagnostics each missed gates and produced a
 * confident "nothing explains it". This one does not re-implement anything: it
 * imports applyPromotions() itself, rebuilds the order's context (items,
 * subtotal, order type, zone, payment method, timestamp), and asks the engine.
 * Then, for any promo that did NOT fire, it relaxes one restriction at a time
 * and re-runs — so the gate that actually blocked it names itself.
 *
 * Writes NOTHING.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_replay-order-promos.ts <order-number>
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
if (!arg) { console.error("Usage: ... _replay-order-promos.ts <order-number>"); process.exit(1); }
const orderNumber = arg.replace(/^#/, "");

async function main() {
  const { applyPromotions } = await import("../src/lib/promo-engine");

  const order = await prisma.order.findFirst({
    where: { orderNumber: { contains: orderNumber } },
    select: {
      id: true, orderNumber: true, restaurantId: true, type: true, createdAt: true,
      subtotal: true, deliveryFee: true, total: true, promoDiscount: true,
      paymentMethod: true, deliveryZoneId: true, viaMarketplace: true,
      customerEmail: true, customerPhone: true, customerId: true,
      items: { select: { menuItemId: true, quantity: true, subtotal: true, price: true } },
      restaurant: { select: { name: true, timezone: true } },
    },
  });
  if (!order) { console.error(`No order matching "${orderNumber}".`); process.exit(1); }

  console.log(`\n=== REPLAY ${order.orderNumber} — ${order.restaurant.name} ===`);
  console.log(`  ${order.createdAt.toISOString()} | ${order.type} | subtotal $${order.subtotal.toFixed(2)} | deliveryFee charged $${(order.deliveryFee ?? 0).toFixed(2)}`);
  console.log(`  zone=${order.deliveryZoneId ?? "(NONE — address resolved to no zone)"} | payment=${order.paymentMethod} | marketplace=${order.viaMarketplace}`);

  // Menu ids for category lookup (the engine matches item/category targets).
  const menuIds = order.items.map((i) => i.menuItemId).filter(Boolean) as string[];
  const menuItems = menuIds.length
    ? await prisma.menuItem.findMany({ where: { id: { in: menuIds } }, select: { id: true, categoryId: true } })
    : [];
  const catById = new Map(menuItems.map((m) => [m.id, m.categoryId]));

  const items = order.items.map((i, idx) => ({
    menuItemId: i.menuItemId ?? `unknown-${idx}`,
    categoryId: catById.get(i.menuItemId ?? "") ?? null,
    variantId: null,
    lineKey: String(idx),
    price: i.price ?? 0,
    sizedBase: i.price ?? 0,
    baseNoSize: i.price ?? 0,
    quantity: i.quantity ?? 1,
    subtotal: i.subtotal ?? 0,
  }));

  const promos = await prisma.promotion.findMany({
    where: { restaurantId: order.restaurantId, isActive: true },
    include: { groupLinks: { select: { groupId: true, customerId: true, email: true, phone: true } } },
    take: 500,
  });

  // Rebuild the context as it was AT ORDER TIME. isNewCustomer/isMember are
  // reconstructed from history so the replay matches what the engine saw.
  const priorFulfilled = await prisma.order.count({
    where: {
      restaurantId: order.restaurantId,
      status: { notIn: ["cancelled", "rejected"] },
      viaMarketplace: order.viaMarketplace,
      createdAt: { lt: order.createdAt },
      OR: [
        ...(order.customerId ? [{ customerId: order.customerId }] : []),
        ...(order.customerEmail ? [{ customerEmail: order.customerEmail }] : []),
        ...(order.customerPhone ? [{ customerPhone: order.customerPhone }] : []),
      ],
    },
  });
  const account = order.customerEmail
    ? await prisma.customerAccount.findUnique({ where: { email: order.customerEmail.toLowerCase() }, select: { id: true } })
    : null;

  const baseCtx: any = {
    orderType: order.type,
    isNewCustomer: priorFulfilled === 0,
    isMember: !!account,
    subtotal: order.subtotal,
    items,
    paymentMethod: order.paymentMethod,
    deliveryZoneId: order.deliveryZoneId ?? undefined,
    // The fee that WOULD be charged — what a free_delivery promo is worth.
    deliveryFee: order.deliveryFee ?? 0,
    now: order.createdAt,
    restaurantTimezone: order.restaurant.timezone,
  };

  console.log(`  reconstructed: isNewCustomer=${baseCtx.isNewCustomer} (${priorFulfilled} prior) isMember=${baseCtx.isMember}\n`);

  const run = (ctx: any, list = promos) => applyPromotions(list as any, ctx).map((r: any) => ({ name: r.name, type: r.type, discount: r.discount }));

  const applied = run(baseCtx);
  console.log(`--- Engine result at order time: ${applied.length} promo(s) ---`);
  for (const r of applied) console.log(`  ${r.name}  [${r.type}]  $${Number(r.discount ?? 0).toFixed(2)}`);
  if (!applied.length) console.log("  (none)");

  // Now explain each promo that did NOT fire, by relaxing one gate at a time.
  const firedNames = new Set(applied.map((r) => r.name));
  const missing = promos.filter((p) => !firedNames.has(p.name));

  console.log(`\n--- Why the other ${missing.length} active promo(s) did not fire ---`);
  for (const p of missing) {
    // Relaxations, each isolating ONE restriction.
    const probes: Array<{ label: string; promo: any; ctx?: any }> = [
      { label: "delivery-zone restriction", promo: { ...p, deliveryZoneIds: null } },
      { label: "payment-method restriction", promo: { ...p, paymentMethodSlugs: null } },
      { label: "day/time window (limited showtime)", promo: { ...p, limitedShowtimeSchedules: [] } },
      { label: "start/end dates", promo: { ...p, startsAt: null, endsAt: null } },
      { label: "minimum order", promo: { ...p, minimumOrder: 0 } },
      { label: "order-type restriction", promo: { ...p, orderType: "both" } },
      { label: "client-type restriction", promo: { ...p, customerType: "any" } },
      { label: "global usage cap", promo: { ...p, usageLimit: null } },
      { label: "once-per-customer", promo: { ...p, onceLifetimePerClient: false } },
    ];

    const culprits: string[] = [];
    for (const probe of probes) {
      const withRelaxed = promos.map((x) => (x.id === p.id ? probe.promo : x));
      const res = run(probe.ctx ?? baseCtx, withRelaxed);
      if (res.some((r) => r.name === p.name)) culprits.push(probe.label);
    }

    console.log(`\n  "${p.name}" [${p.promotionType}, ${p.stackingRule}]`);
    if (culprits.length) {
      console.log(`     BLOCKED BY: ${culprits.join("  AND/OR  ")}`);
      console.log(`     (relaxing that alone makes it apply)`);
    } else {
      console.log(`     no single restriction explains it — it is being out-competed by another`);
      console.log(`     promo for the exclusive slot, or its calculated value is $0 on this cart.`);
    }
  }
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
