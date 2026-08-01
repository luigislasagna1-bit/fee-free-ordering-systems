/**
 * READ-ONLY: ask the LIVE site what promos a real cart would get.
 *
 * This is the only fully trustworthy promo diagnostic, because it does not
 * reimplement anything: it POSTs a real cart to the real
 * /api/public/apply-promos on production — the same endpoint the ordering page
 * calls — and prints exactly what comes back.
 *
 * Why that matters: _why-no-promo.ts calls the promo ENGINE directly, which
 * SKIPS buildPromoOrderContext. That is where VIP member-only promos are pulled
 * out of the public pool and added back with autoApply FORCED ON for a matching
 * member. So the engine-only script can report "needs a coupon code typed" for a
 * member special that actually auto-applies in real life. This script cannot
 * make that mistake.
 *
 * It reads the menu items from the DB only to build a realistic cart, then
 * leaves the verdict entirely to production. Writes NOTHING.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_probe-live-promos.ts <slug> <email> "<item>" ["<item2>" ...]
 * e.g.
 *   npx tsx scripts/run-on-prod.ts scripts/_probe-live-promos.ts luigis-lasagna-pizzeria samsrestaurantsystems@gmail.com "Wings Combo"
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

const [, , slug, email, ...itemQueries] = process.argv;
if (!slug || !email || itemQueries.length === 0) {
  console.error('Usage: ... _probe-live-promos.ts <slug> <email> "<item>" ["<item2>" ...]');
  process.exit(1);
}

async function main() {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, customDomain: true, customDomainStatus: true, subdomain: true },
  });
  if (!restaurant) { console.error(`No restaurant "${slug}".`); process.exit(1); }

  // Where the customer actually orders. Prefer the live custom domain.
  const host = restaurant.customDomain && restaurant.customDomainStatus === "verified"
    ? `https://www.${restaurant.customDomain.replace(/^www\./, "")}`
    : "https://feefreeordering.com";
  const url = `${host}/api/public/apply-promos`;

  const items: any[] = [];
  for (const [i, q] of itemQueries.entries()) {
    const mi = await prisma.menuItem.findFirst({
      where: { restaurantId: restaurant.id, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, price: true, categoryId: true, category: { select: { name: true } } },
    });
    if (!mi) { console.error(`  no menu item matching "${q}"`); continue; }
    console.log(`  cart line ${i}: ${mi.name}  $${(mi.price ?? 0).toFixed(2)}  category="${mi.category?.name ?? "-"}"`);
    items.push({
      menuItemId: mi.id, categoryId: mi.categoryId, variantId: null, lineKey: String(i),
      price: mi.price ?? 0, sizedBase: mi.price ?? 0, baseNoSize: mi.price ?? 0,
      quantity: 1, subtotal: mi.price ?? 0,
    });
  }
  if (!items.length) { console.error("nothing to send"); process.exit(1); }

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  console.log(`\n=== ${restaurant.name} — asking the LIVE site ===`);
  console.log(`  ${url}`);
  console.log(`  as GUEST typing: ${email}   subtotal $${subtotal.toFixed(2)}\n`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ restaurantSlug: slug, orderType: "pickup", subtotal, items, email }),
  });
  const j: any = await res.json().catch(() => ({}));

  console.log(`--- APPLIED (${(j.applied ?? []).length}) ---`);
  for (const p of j.applied ?? []) {
    console.log(`  ${p.name} [${p.type}]  -$${Number(p.discount ?? 0).toFixed(2)}`);
  }
  if (!(j.applied ?? []).length) console.log("  (none)");

  console.log(`\n--- QUALIFIED BUT BLOCKED (${(j.blockedPromos ?? []).length}) ---`);
  for (const b of j.blockedPromos ?? []) {
    console.log(`  ${b.name}  -$${Number(b.discount ?? 0).toFixed(2)}  blocked by "${b.winnerName}"  (thatWasExclusive=${b.wasExclusive})`);
  }
  if (!(j.blockedPromos ?? []).length) {
    console.log("  (none — so nothing was out-competed for the exclusive slot)");
  }

  console.log(`\n  totalDiscount: $${Number(j.totalDiscount ?? 0).toFixed(2)}`);
  console.log(`  freeDelivery : ${j.hasFreeDelivery}`);
  console.log(`  identity     : ${JSON.stringify(j.identity ?? null)}`);
  if (j.promoCodeEmailMismatch) console.log(`  ⚠️ promoCodeEmailMismatch`);

  console.log(`\nREAD IT LIKE THIS:`);
  console.log(`  • the member special in APPLIED  -> it works; the earlier engine-only`);
  console.log(`    script was wrong about it and the problem is elsewhere.`);
  console.log(`  • in BLOCKED                      -> it qualifies but an exclusive beat it;`);
  console.log(`    the winner is named, so change one of their stacking rules.`);
  console.log(`  • in NEITHER                      -> the VIP add-back never matched this`);
  console.log(`    email, i.e. group membership or the promo's group link is the problem.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
