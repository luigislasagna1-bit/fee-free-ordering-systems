/**
 * READ-ONLY: "why does NO promo discount this specific item?"
 *
 * Separates the three causes that all look identical at checkout (no discount
 * line, no explanation):
 *
 *   A. the item (or its category) is on the "No discounts on these items" list
 *      (MenuItem.promoExcluded OR Category.promoExcluded) — every promo skips it
 *   B. no active promo's item/category targeting includes it — each computes $0
 *   C. promos DO hit it but an exclusive out-competed them — visible as
 *      "blocked" in _probe-live-promos.ts, NOT here
 *
 * Prints the item's flags + category, then every active promo's targeting with
 * CATEGORY AND ITEM NAMES (not ids), and a per-promo verdict for this item.
 *
 * Writes NOTHING.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_diagnose-item-discount.ts <slug> "<item name>"
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

const [, , slug, itemQuery] = process.argv;
if (!slug || !itemQuery) { console.error('Usage: ... _diagnose-item-discount.ts <slug> "<item name>"'); process.exit(1); }

async function main() {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!restaurant) { console.error(`No restaurant "${slug}".`); process.exit(1); }

  const items = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id, name: { contains: itemQuery, mode: "insensitive" } },
    select: {
      id: true, name: true, price: true, isAvailable: true, comboConfig: true,
      promoExcluded: true, categoryId: true,
      category: { select: { id: true, name: true, promoExcluded: true } },
    },
    take: 5,
  });
  if (!items.length) { console.error(`No menu item matching "${itemQuery}".`); process.exit(1); }

  // Name lookups for promo targeting.
  const cats = await prisma.menuCategory.findMany({
    where: { restaurantId: restaurant.id },
    select: { id: true, name: true },
  });
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const allItems = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id },
    select: { id: true, name: true },
    take: 2000,
  });
  const itemName = new Map(allItems.map((i) => [i.id, i.name]));

  const promos = await prisma.promotion.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    select: {
      id: true, name: true, promotionType: true, stackingRule: true, customerType: true,
      autoApply: true, couponCode: true, minimumOrder: true, orderType: true, ruleConfig: true,
      startsAt: true, endsAt: true, limitedShowtimeSchedules: true,
      groupLinks: { select: { groupId: true, customerId: true, email: true, group: { select: { name: true } } } },
    },
  });

  for (const item of items) {
    const excluded = !!(item.promoExcluded || item.category?.promoExcluded);
    console.log(`\n=== "${item.name}"  $${(item.price ?? 0).toFixed(2)} ===`);
    console.log(`  category            : ${item.category?.name ?? "(none)"}`);
    console.log(`  combo menu item     : ${item.comboConfig ? "yes" : "no"}`);
    console.log(`  item promoExcluded  : ${item.promoExcluded}`);
    console.log(`  category promoExcl. : ${item.category?.promoExcluded ?? "-"}`);
    if (excluded) {
      console.log(`  🚫 ON THE "NO DISCOUNTS" LIST — every promo and coupon skips this item.`);
      console.log(`     Fix: Admin → Promotions → "No discounts on these items" → remove ` +
        (item.promoExcluded ? `the item "${item.name}".` : `the category "${item.category?.name}".`));
    }

    console.log(`\n  --- Active promos vs this item ---`);
    for (const p of promos) {
      const rc: any = p.ruleConfig ?? {};
      const pct = rc.discountPercent ?? rc.percent ?? null;
      const groups: any[] | null = Array.isArray(rc.groups) && rc.groups.length ? rc.groups : null;
      let verdict: string;
      if (excluded) verdict = "SKIPPED — item is on the no-discounts list";
      else if (!groups) verdict = "whole-cart promo — applies to the ORDER TOTAL (item qualifies via subtotal)";
      else {
        const hit = groups.some((g: any) =>
          (Array.isArray(g?.categoryIds) && item.categoryId && g.categoryIds.includes(item.categoryId)) ||
          (Array.isArray(g?.menuItemIds) && g.menuItemIds.includes(item.id)));
        verdict = hit ? "TARGETS THIS ITEM ✅" : "does NOT target this item — computes $0 on it";
      }
      console.log(`\n  "${p.name}" [${p.promotionType}, ${p.stackingRule}, ${p.customerType}, autoApply=${p.autoApply}${p.couponCode ? `, code=${p.couponCode}` : ""}]`);
      if (pct != null) console.log(`     percent: ${pct}%   minOrder: $${(p.minimumOrder ?? 0).toFixed(2)}   orderType: ${p.orderType}`);
      if (groups) {
        for (const g of groups) {
          const cNames = Array.isArray(g?.categoryIds) ? g.categoryIds.map((id: string) => catName.get(id) ?? id) : [];
          const iNames = Array.isArray(g?.menuItemIds) ? g.menuItemIds.map((id: string) => itemName.get(id) ?? id) : [];
          const parts = [
            cNames.length ? `categories: ${cNames.join(", ")}` : null,
            iNames.length ? `items: ${iNames.slice(0, 8).join(", ")}${iNames.length > 8 ? ` …+${iNames.length - 8}` : ""}` : null,
          ].filter(Boolean);
          console.log(`     targets ${parts.join("  |  ") || JSON.stringify(g).slice(0, 120)}`);
        }
      }
      const sched: any = (p as any).limitedShowtimeSchedules;
      if (Array.isArray(sched) && sched.length) console.log(`     day/time windows: ${JSON.stringify(sched)}`);
      if ((p as any).startsAt || (p as any).endsAt) console.log(`     dates: ${(p as any).startsAt?.toISOString?.() ?? "-"} -> ${(p as any).endsAt?.toISOString?.() ?? "-"}`);
      const links: any[] = (p as any).groupLinks ?? [];
      if (links.length) {
        const who = links.map((l) => l.group?.name ? `group "${l.group.name}"` : (l.email ?? l.customerId ?? "?"));
        console.log(`     VIP-linked to: ${who.join(", ")}  (auto-applies ONLY for these members)`);
      } else {
        console.log(`     VIP-linked to: nobody — public promo${p.autoApply ? "" : ", so the CODE is the only way in"}`);
      }
      console.log(`     => ${verdict}`);
    }
  }
  // Who is in which VIP group — answers "why did MY login not get the special".
  const groups = await prisma.customerGroup.findMany({
    where: { restaurantId: restaurant.id },
    select: { id: true, name: true, members: { select: { email: true, customer: { select: { email: true } } }, take: 50 } },
  });
  console.log(`
=== VIP groups & members ===`);
  for (const g of groups) {
    const emails = g.members.map((m) => (m.email ?? m.customer?.email ?? "?").toLowerCase());
    console.log(`  "${g.name}": ${emails.join(", ") || "(empty)"}`);
  }
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
