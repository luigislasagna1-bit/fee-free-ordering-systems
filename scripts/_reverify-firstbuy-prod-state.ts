/**
 * ADVERSARIAL RE-VERIFICATION (read-only, zero writes): independently confirm
 * the prod state behind the FIRSTBUY root-cause claim:
 *   - Promotion cmq73x6lq000204l29joc0njb isActive=false, updatedAt 2026-06-20
 *   - KickstarterState.firstBuyPromoEnabled=true, inviteProspectsEnabled=true
 *   - active promo pool excludes FIRSTBUY
 *   - orders cmrfja03d / cmrp4cvzz: promoDiscount=0 + zero prior counting rows
 *
 * URL discovery follows the scripts/push-schema-to-both.ts convention: read
 * every DATABASE_URL line (active or commented) from .env.local and pick the
 * PROD one (ep-dawn-tree). No credential ever appears on the command line.
 * Run: npx tsx scripts/_reverify-firstbuy-prod-state.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const envText = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m) urls.push(m[1]);
}
const prodUrl = urls.find((u) => /ep-dawn-tree/i.test(u));
if (!prodUrl) {
  console.error("No prod (ep-dawn-tree) DATABASE_URL found in .env.local");
  process.exit(1);
}
console.log("DB host:", prodUrl.match(/@([^/]+)\//)?.[1]);

const mask = (e?: string | null) =>
  !e ? "-" : e.includes("@") ? e.slice(0, 3) + "***@" + e.split("@")[1] : "***" + e.slice(-4);

async function main() {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: prodUrl }) } as any);

  // 1. The promo row by the exact id the synthesis cites
  const promo = await p.promotion.findUnique({
    where: { id: "cmq73x6lq000204l29joc0njb" },
    include: { _count: { select: { groupLinks: true } } },
  });
  if (!promo) {
    console.log("PROMO cmq73x6lq000204l29joc0njb: NOT FOUND");
  } else {
    console.log("PROMO:", {
      id: promo.id,
      restaurantId: promo.restaurantId,
      name: promo.name,
      isActive: promo.isActive,
      autoApply: promo.autoApply,
      couponCode: promo.couponCode,
      customerType: promo.customerType,
      channel: promo.channel,
      orderType: promo.orderType,
      stackingRule: promo.stackingRule,
      minimumOrder: promo.minimumOrder,
      usageLimit: promo.usageLimit,
      usedCount: promo.usedCount,
      onceLifetimePerClient: promo.onceLifetimePerClient,
      startsAt: promo.startsAt,
      endsAt: promo.endsAt,
      daysOfWeek: promo.daysOfWeek,
      campaignRef: promo.campaignRef,
      groupLinks: promo._count.groupLinks,
      createdAt: promo.createdAt.toISOString(),
      updatedAt: promo.updatedAt.toISOString(),
    });
    const usages = await p.promotionUsage.count({ where: { promotionId: promo.id } });
    console.log("PromotionUsage rows:", usages);

    // 2. Kickstarter state for the same restaurant
    const ks = await p.kickstarterState.findUnique({ where: { restaurantId: promo.restaurantId } });
    console.log(
      "KICKSTARTER STATE:",
      ks
        ? {
            firstBuyPromoEnabled: ks.firstBuyPromoEnabled,
            inviteProspectsEnabled: ks.inviteProspectsEnabled,
            updatedAt: ks.updatedAt.toISOString(),
          }
        : "NO ROW",
    );

    // 3. Active pool (what promotionPoolWhere admits, isActive:true)
    const pool = await p.promotion.findMany({
      where: { restaurantId: promo.restaurantId, isActive: true },
      select: { id: true, name: true, promotionType: true, customerType: true, channel: true, campaignRef: true },
    });
    console.log(`ACTIVE POOL (${pool.length}):`);
    for (const pr of pool)
      console.log(`   ${pr.name} | ${pr.promotionType} | cust=${pr.customerType} | ch=${pr.channel} | ref=${pr.campaignRef ?? "-"}`);

    // 4. The two real-customer orders + their prior counting rows
    for (const oid of ["cmrfja03d", "cmrp4cvzz"]) {
      const o = await p.order.findFirst({
        where: { id: { startsWith: oid }, restaurantId: promo.restaurantId },
        select: {
          id: true, createdAt: true, status: true, paymentStatus: true, type: true,
          viaMarketplace: true, total: true, promoDiscount: true, couponDiscount: true,
          appliedPromos: true, customerEmail: true, customerPhone: true, customerId: true,
        },
      });
      if (!o) { console.log(`ORDER ${oid}*: NOT FOUND`); continue; }
      console.log(`ORDER ${o.id}: ${o.createdAt.toISOString()} ${o.status}/${o.paymentStatus} ${o.type} total=${o.total} promoDisc=${o.promoDiscount} couponDisc=${o.couponDiscount} ${mask(o.customerEmail)} ${mask(o.customerPhone)}`);
      console.log(`   appliedPromos: ${o.appliedPromos ? String(o.appliedPromos).slice(0, 200) : "-"}`);
      const idClauses: any[] = [];
      if (o.customerId) idClauses.push({ customerId: o.customerId });
      if (o.customerEmail) idClauses.push({ customerEmail: { equals: o.customerEmail, mode: "insensitive" } });
      if (o.customerPhone) idClauses.push({ customerPhone: o.customerPhone });
      const priors = idClauses.length
        ? await p.order.count({
            where: {
              restaurantId: promo.restaurantId,
              status: { notIn: ["cancelled", "rejected"] },
              viaMarketplace: o.viaMarketplace,
              createdAt: { lt: o.createdAt },
              OR: idClauses,
            },
          })
        : 0;
      console.log(`   prior counting orders at charge time: ${priors}`);
      // Was this buyer an emailed prospect?
      if (o.customerEmail) {
        const prospect = await p.prospect.findFirst({
          where: { email: { equals: o.customerEmail, mode: "insensitive" }, import: { restaurantId: promo.restaurantId } },
          select: { emailSentAt: true },
        });
        console.log(`   prospect row: ${prospect ? `emailSentAt=${prospect.emailSentAt?.toISOString() ?? "null"}` : "none"}`);
      }
    }

    // 5. Campaign-window order sweep: any FIRSTBUY / promoDiscount>0 at all?
    const withDiscount = await p.order.count({
      where: { restaurantId: promo.restaurantId, createdAt: { gte: new Date("2026-07-10T16:00:00Z") }, promoDiscount: { gt: 0 } },
    });
    const totalSince = await p.order.count({
      where: { restaurantId: promo.restaurantId, createdAt: { gte: new Date("2026-07-10T16:00:00Z") } },
    });
    console.log(`ORDERS SINCE 2026-07-10T16:00Z: ${totalSince}, with promoDiscount>0: ${withDiscount}`);
  }

  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
