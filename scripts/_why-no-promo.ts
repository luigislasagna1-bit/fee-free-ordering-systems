/**
 * READ-ONLY: "why is this promo not applying to this item?"
 *
 * Replays the REAL promo engine against a one-item cart, exactly as the
 * ordering page would send it, then — for every active promo that did NOT
 * fire — relaxes ONE restriction at a time and re-runs. Whichever relaxation
 * makes it apply IS the blocker, so the answer is derived rather than guessed.
 *
 * Written for Luigi's "20% off all SPECIALS / DAILY DEALS isn't applying to my
 * combo" question. It also reports whether the item is a COMBO MENU ITEM
 * (MenuItem.comboConfig) or would arrive as a promo-built BUNDLE line, because
 * those are treated completely differently: bundle lines are filtered out of
 * promo evaluation on purpose, combo menu items are not.
 *
 * Writes NOTHING.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_why-no-promo.ts <slug> "<item name>" [customer-email]
 * e.g.
 *   npx tsx scripts/run-on-prod.ts scripts/_why-no-promo.ts luigis-lasagna-pizzeria "Wings Combo" info@luigislasagna.com
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

const [, , slug, itemQuery, email] = process.argv;
if (!slug || !itemQuery) {
  console.error('Usage: ... _why-no-promo.ts <slug> "<item name>" [customer-email]');
  process.exit(1);
}

async function main() {
  const { applyPromotions } = await import("../src/lib/promo-engine");

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, timezone: true },
  });
  if (!restaurant) { console.error(`No restaurant "${slug}".`); process.exit(1); }

  const item = await prisma.menuItem.findFirst({
    where: { restaurantId: restaurant.id, name: { contains: itemQuery, mode: "insensitive" } },
    select: {
      id: true, name: true, price: true, categoryId: true, comboConfig: true, isAvailable: true,
      category: { select: { id: true, name: true } },
    },
  });
  if (!item) { console.error(`No menu item matching "${itemQuery}" at ${restaurant.name}.`); process.exit(1); }

  console.log(`\n=== ${restaurant.name} — "${item.name}" ===`);
  console.log(`  price      : $${(item.price ?? 0).toFixed(2)}`);
  console.log(`  category   : ${item.category?.name ?? "(none)"}  [${item.categoryId ?? "-"}]`);
  console.log(`  available  : ${item.isAvailable}`);
  console.log(`  combo item : ${item.comboConfig ? "YES — a COMBO MENU ITEM (has comboConfig)" : "no"}`);
  if (item.comboConfig) {
    console.log("               Combo MENU ITEMS are ordinary items to the promo engine:");
    console.log("               they carry a real category and CAN be discounted.");
    console.log("               (Promo-built BUNDLE lines are the ones excluded — different thing.)");
  }

  // Identity, resolved the way checkout resolves it.
  let isMember = false;
  let isNewCustomer = true;
  if (email) {
    const e = email.trim().toLowerCase();
    const acct = await prisma.customerAccount.findUnique({ where: { email: e }, select: { id: true } });
    isMember = !!acct;
    const prior = await prisma.order.count({
      where: { restaurantId: restaurant.id, status: { notIn: ["cancelled", "rejected"] }, customerEmail: e },
    });
    isNewCustomer = prior === 0;
    console.log(`  customer   : ${e}  isMember=${isMember} (marketplace account) isNewCustomer=${isNewCustomer} (${prior} prior)`);
    console.log(`               NOTE: signing in on the restaurant site sets isMember too — this`);
    console.log(`               script cannot see a session, so a "members only" promo may show`);
    console.log(`               as blocked here yet work for a SIGNED-IN customer.`);
  }

  const promos = await prisma.promotion.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    include: { groupLinks: { select: { groupId: true, customerId: true, email: true, phone: true } } },
    take: 500,
  });

  const line = {
    menuItemId: item.id,
    categoryId: item.categoryId,
    variantId: null,
    lineKey: "0",
    price: item.price ?? 0,
    sizedBase: item.price ?? 0,
    baseNoSize: item.price ?? 0,
    quantity: 1,
    subtotal: item.price ?? 0,
  };
  const baseCtx: any = {
    orderType: "pickup",
    isNewCustomer,
    isMember,
    subtotal: item.price ?? 0,
    items: [line],
    now: new Date(),
    restaurantTimezone: restaurant.timezone,
  };

  const run = (ctx: any, list = promos) =>
    applyPromotions(list as any, ctx).map((r: any) => ({ name: r.name, type: r.type, discount: r.discount }));

  const applied = run(baseCtx);
  console.log(`\n--- Applied to a cart containing just this item: ${applied.length} ---`);
  for (const r of applied) console.log(`  ${r.name} [${r.type}] -$${Number(r.discount ?? 0).toFixed(2)}`);
  if (!applied.length) console.log("  (none)");

  const fired = new Set(applied.map((r) => r.name));
  const missing = promos.filter((p) => !fired.has(p.name));
  console.log(`\n--- Why the other ${missing.length} active promo(s) did not fire ---`);

  for (const p of missing) {
    const probes: Array<{ label: string; promo: any; ctx?: any }> = [
      { label: "which items/categories it targets", promo: { ...p, ruleConfig: stripGroups(p.ruleConfig) } },
      { label: "minimum order", promo: { ...p, minimumOrder: 0 } },
      { label: "order-type restriction", promo: { ...p, orderType: "both" } },
      { label: "client type (new/returning/members-only)", promo: { ...p, customerType: "any" } },
      { label: "day/time window", promo: { ...p, limitedShowtimeSchedules: [] } },
      { label: "start/end dates", promo: { ...p, startsAt: null, endsAt: null } },
      { label: "global usage cap", promo: { ...p, usageLimit: null } },
      { label: "delivery-zone restriction", promo: { ...p, deliveryZoneIds: null } },
      { label: "payment-method restriction", promo: { ...p, paymentMethodSlugs: null } },
      { label: "needs a coupon code typed", promo: { ...p, autoApply: true }, ctx: { ...baseCtx, couponCode: p.couponCode ?? undefined } },
      { label: "VIP targeting (it is member-only and this identity does not match)", promo: { ...p, groupLinks: [] } },
    ];
    const culprits: string[] = [];
    for (const probe of probes) {
      const list = promos.map((x) => (x.id === p.id ? probe.promo : x));
      if (run(probe.ctx ?? baseCtx, list).some((r) => r.name === p.name)) culprits.push(probe.label);
    }
    console.log(`\n  "${p.name}" [${p.promotionType}, ${p.stackingRule}, customerType=${p.customerType}]`);
    if (culprits.length) {
      console.log(`     BLOCKED BY: ${culprits.join("  AND/OR  ")}`);
    } else {
      console.log(`     no single restriction explains it — it is out-competed by another`);
      console.log(`     promo for the exclusive slot, or worth $0 on this one-item cart.`);
    }
  }
  console.log("");
}

/** Remove item/category targeting so we can tell whether THAT is the blocker. */
function stripGroups(ruleConfig: unknown): unknown {
  if (!ruleConfig || typeof ruleConfig !== "object") return ruleConfig;
  const rc = { ...(ruleConfig as Record<string, unknown>) };
  delete rc.groups;
  return rc;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
